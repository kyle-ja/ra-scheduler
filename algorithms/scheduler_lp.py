#!/usr/bin/env python3
"""
Employee-scheduler solver using Google OR-Tools CP-SAT.

Usage:
    python algorithms/scheduler_lp.py input.json output.json

Input JSON shape:
{
  "employees": [
    { "name": "Kyle", "weekday_cost": [1,2,3,4,5,6,7] }
  ],
  "dates": [
    { "date": "2025-06-03", "weekday": 1 }   # weekday: 0 = Sunday … 6 = Saturday
  ]
}

Output JSON:  [{ "date": "YYYY-MM-DD", "employee": "Name" }, …]
"""

import json
import sys
from pathlib import Path
from typing import Dict, List

from ortools.sat.python import cp_model


def solve(payload: Dict) -> List[Dict]:
    employees = payload["employees"]
    dates = payload["dates"]
    # Read max_consecutive_days from payload, default to 2 if not present
    max_consecutive_days = payload.get("max_consecutive_days", 2)

    num_emp = len(employees)
    num_days = len(dates)

    model = cp_model.CpModel()

    # ------------------------------------------------------------------
    # Decision variables: x[i][d] == 1 if employee i works day d
    # ------------------------------------------------------------------
    x = [
        [model.NewBoolVar(f"x_{i}_{d}") for d in range(num_days)]
        for i in range(num_emp)
    ]

    # ------------------------------------------------------------------
    # C1: Exactly one employee per day
    # ------------------------------------------------------------------
    for d in range(num_days):
        model.Add(sum(x[i][d] for i in range(num_emp)) == 1)

    # ------------------------------------------------------------------
    # C2: No employee works > X days in a row
    # ------------------------------------------------------------------
    for i in range(num_emp):
        # Iterate up to num_days - max_consecutive_days because the sum looks ahead `max_consecutive_days` times
        # (i.e., includes `max_consecutive_days + 1` terms: d, d+1, ..., d+max_consecutive_days)
        for d in range(num_days - max_consecutive_days):
            # An employee cannot work `max_consecutive_days + 1` days in a row.
            # Sum of assignments over `max_consecutive_days + 1` consecutive days must be <= `max_consecutive_days`.
            model.Add(sum(x[i][d + k] for k in range(max_consecutive_days + 1)) <= max_consecutive_days)

    # ------------------------------------------------------------------
    # C3: Balanced workload (+/-1 day from average)
    # ------------------------------------------------------------------
    min_load = num_days // num_emp if num_emp > 0 else num_days
    max_load = (num_days + num_emp - 1) // num_emp if num_emp > 0 else num_days
    for i in range(num_emp):
        total_days_worked_by_emp = sum(x[i][d] for d in range(num_days))
        model.Add(total_days_worked_by_emp >= min_load)
        model.Add(total_days_worked_by_emp <= max_load)

    # Precompute costs and preference day indices for each employee
    emp_rank1_day_indices = [[] for _ in range(num_emp)]
    emp_top3_pref_day_indices = [[] for _ in range(num_emp)]
    cost_matrix = [[0] * num_days for _ in range(num_emp)]

    for i, emp in enumerate(employees):
        for d, date_info in enumerate(dates):
            weekday = date_info["weekday"]
            cost = emp["weekday_cost"][weekday]
            cost_matrix[i][d] = cost
            if cost == 0:  # Rank 1 preference
                emp_rank1_day_indices[i].append(d)
            if cost <= 40:  # Top 3 preferences (costs 0, 20, 40)
                emp_top3_pref_day_indices[i].append(d)

    # ------------------------------------------------------------------
    # C4: Each employee must get at least one of their rank-1 (cost 0) days
    # ------------------------------------------------------------------
    for i in range(num_emp):
        if emp_rank1_day_indices[i]:  # If they have any rank-1 days
            model.Add(sum(x[i][d] for d in emp_rank1_day_indices[i]) >= 1)

    # ------------------------------------------------------------------
    # C5: Each employee must get at least one of their top-3 preference days
    # (This might be redundant if C4 is active and rank-1 is part of top-3, 
    #  but ensures at least a cost <= 40 day if no rank-1 day is available/possible)
    # ------------------------------------------------------------------
    MIN_TOP_N_DAYS_GUARANTEE = 1 # Configurable: Try 1 or 2
                               # Ensure this is less than or equal to total days an employee works (min_load)
    actual_min_top_n_days = min(MIN_TOP_N_DAYS_GUARANTEE, min_load)
    if actual_min_top_n_days > 0:
        for i in range(num_emp):
            # Only apply if employee has enough distinct top-3 preference days listed and available
            distinct_top3_pref_days = set(emp_top3_pref_day_indices[i])
            if len(distinct_top3_pref_days) >= actual_min_top_n_days:
                 model.Add(sum(x[i][d] for d in distinct_top3_pref_days) >= actual_min_top_n_days)

    # --- Objective Function Components ---
    employee_total_costs = []
    assignments_to_cost_100_days = []
    assigned_rank1_days_per_employee = []

    for i in range(num_emp):
        # Total cost for employee i
        emp_cost_var = sum(cost_matrix[i][d] * x[i][d] for d in range(num_days))
        employee_total_costs.append(emp_cost_var)

        # Assignments to cost 100 days for employee i
        cost_100_sum = sum(x[i][d] for d in range(num_days) if cost_matrix[i][d] == 100)
        assignments_to_cost_100_days.append(cost_100_sum)
        
        if emp_rank1_day_indices[i]:
            rank1_sum = sum(x[i][d] for d in emp_rank1_day_indices[i])
            assigned_rank1_days_per_employee.append(rank1_sum)
        else: # Employee has no rank-1 preferences, add a dummy 0 to keep list sizes aligned for min calculation
              # This means they won't pull down the min_assigned_rank1_days objective if they genuinely have no rank-1 days.
              # Or, we can make min_assigned_rank1_days only apply to employees with rank-1 preferences.
              # For simplicity here, if no rank-1 days, they aren't part of this specific objective push.
              # The hard constraint C4 already ensures they get one *if they have preferences*. This obj pushes for *more*.
              pass # assigned_rank1_days_per_employee will be shorter, handle below

    # P0: Maximize the minimum number of Rank-1 days assigned to any employee (who has rank-1 prefs)
    min_assigned_rank1_days = model.NewIntVar(0, num_days, "min_assigned_rank1_days")
    # Only consider employees who actually have rank-1 preferences for this objective goal
    employees_with_rank1_prefs_indices = [i for i, R1_days in enumerate(emp_rank1_day_indices) if R1_days]
    temp_assigned_rank1_vars_for_min_calc = []
    for i in employees_with_rank1_prefs_indices:
        # Need to re-create sum for these employees as model variables
        emp_rank1_assigned_var = model.NewIntVar(0, num_days, f"emp_{i}_rank1_assigned_count")
        model.Add(emp_rank1_assigned_var == sum(x[i][d] for d in emp_rank1_day_indices[i]))
        model.Add(emp_rank1_assigned_var >= min_assigned_rank1_days)
        temp_assigned_rank1_vars_for_min_calc.append(emp_rank1_assigned_var)
    
    if not employees_with_rank1_prefs_indices: # No one has rank-1 preferences, min_assigned_rank1_days is effectively 0
        model.Add(min_assigned_rank1_days == 0)

    # P1: Minimize the maximum total cost for any single employee (Minimax cost)
    max_employee_total_cost = model.NewIntVar(0, num_days * 100, "max_employee_total_cost")
    for cost_var in employee_total_costs:
        model.Add(cost_var <= max_employee_total_cost)

    # P2: Minimize the maximum number of Cost-100 days for any single employee
    max_cost_100_days_for_any_employee = model.NewIntVar(0, num_days, "max_cost_100_days_for_any_employee")
    for cost_100_var in assignments_to_cost_100_days:
        model.Add(cost_100_var <= max_cost_100_days_for_any_employee)

    # P3: Minimize total number of assignments to highly undesirable (cost 100) days
    total_cost_100_assignments = sum(assignments_to_cost_100_days)
    
    # P4: Minimize sum of all employees' total costs (utilitarian)
    sum_of_all_employee_costs = sum(employee_total_costs)
    
    # Define weights for the hierarchical objective
    # Priority: 1. Maximize fairness (minimax cost), 2. Avoid very bad days, 3. Minimize overall cost
    W_MIN_RANK1 = 1000000  # P0: Maximize min rank-1 days (highest objective priority)
    W_MAX_COST = 10000    # P1: Minimize max individual total cost
    W_MAX_UNDESIRABLE = 500 # P2: Minimize max individual cost-100 days
    W_COST_100 = 100      # P3: Minimize total cost-100 days
    W_TOTAL_COST = 1      # P4: Minimize sum of all costs (lowest objective priority)

    model.Minimize(
        W_MIN_RANK1 * (-min_assigned_rank1_days) + # Note the negation to maximize
        W_MAX_COST * max_employee_total_cost +
        W_MAX_UNDESIRABLE * max_cost_100_days_for_any_employee +
        W_COST_100 * total_cost_100_assignments +
        W_TOTAL_COST * sum_of_all_employee_costs
    )

    # ------------------------------------------------------------------
    # Solve
    # ------------------------------------------------------------------
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 30 # Slightly increased timeout
    # solver.parameters.log_search_progress = True # Useful for debugging
    status = solver.Solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        error_message = "Unable to find a valid schedule. "
        if status == cp_model.INFEASIBLE:
            # Check for common infeasibility causes
            if num_days < num_emp:
                error_message += f"There are {num_days} days to schedule but {num_emp} employees. Each employee needs at least one day, but there aren't enough days to go around."
            else:
                # Check if any employee has no available days due to preferences
                emp_with_no_available_days = []
                for i, emp in enumerate(employees):
                    has_available_day = False
                    for d in range(num_days):
                        if cost_matrix[i][d] < 1000:  # Day is available (not excluded)
                            has_available_day = True
                            break
                    if not has_available_day:
                        emp_with_no_available_days.append(emp["name"])
                
                if emp_with_no_available_days:
                    error_message += f"Employee(s) {', '.join(emp_with_no_available_days)} have no available days to work based on their preferences and the selected schedulable days."
                else:
                    error_message += "The solver constraints are too strict to find a solution. This could be due to:"
                    error_message += "\n1. Not enough days to satisfy everyone's preferences"
                    error_message += "\n2. Too many consecutive work day restrictions"

        elif status == cp_model.MODEL_INVALID:
            error_message += "The scheduling model is invalid. This is likely due to an internal error."
        elif status == cp_model.UNKNOWN:
            error_message += "The solver could not determine if a solution exists within the time limit. Try reducing the date range."
        raise RuntimeError(error_message)

    # Build output list - ENSURE DATE AND WEEKDAY CONSISTENCY
    schedule = []
    for d_idx, date_info in enumerate(dates): # d_idx is the index for the dates array
        assigned_emp_name = "<UNASSIGNED>" # Should not happen if C1 holds
        for emp_idx, emp in enumerate(employees):
            if solver.Value(x[emp_idx][d_idx]) == 1:
                assigned_emp_name = emp["name"]
                break
        # CRITICAL: Use date_info directly from the input 'dates' array for consistency
        schedule.append({
            "date": date_info["date"], 
            "employee": assigned_emp_name, 
            "weekday": date_info["weekday"]
        })
    
    # Optional: print fairness metrics of the solution
    # print_solution_fairness_metrics(solver, employees, dates, x, cost_matrix, assigned_rank1_days_per_employee, employee_total_cost_vars, min_assigned_rank1_days, max_employee_total_cost, sum_of_all_employee_costs)

    return schedule

# Helper function (optional, for debugging/analysis)
# def print_solution_fairness_metrics(solver, employees, dates, x, cost_matrix, assigned_rank1_days_per_employee, employee_total_cost_vars, min_assigned_rank1_days, max_employee_total_cost, sum_of_all_employee_costs):
#     print("\n--- Solution Fairness Metrics ---")
#     for i, emp in enumerate(employees):
#         print(f"Employee: {emp['name']}")
#         emp_cost = solver.Value(employee_total_cost_vars[i])
#         emp_rank1_days = solver.Value(assigned_rank1_days_per_employee[i]) if emp_rank1_day_indices[i] else "N/A (no rank-1 prefs)"
#         print(f"  Total Cost: {emp_cost}")
#         print(f"  Rank-1 Days Assigned: {emp_rank1_days}")
#         assigned_str = []
#         for d, date_info in enumerate(dates):
#             if solver.Value(x[i][d]) == 1:
#                 day_cost = cost_matrix[i][d]
#                 assigned_str.append(f"{date_info['date']} (cost {day_cost})")
#         print(f"  Assignments: {', '.join(assigned_str)}")
    
#     print(f"\nOverall Metrics:")
#     print(f"  Min Rank-1 Days Assigned to an Employee: {solver.Value(min_assigned_rank1_days)}")
#     print(f"  Max Individual Employee Cost: {solver.Value(max_employee_total_cost)}")
#     print(f"  Sum of All Employee Costs: {solver.Value(sum_of_all_employee_costs)}")

# ----------------------------------------------------------------------
# CLI wrapper
# ----------------------------------------------------------------------
if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python algorithms/scheduler_lp.py input.json output.json")
        sys.exit(1)

    in_path, out_path = map(Path, sys.argv[1:3])
    payload = json.loads(in_path.read_text())
    out = solve(payload)
    out_path.write_text(json.dumps(out, indent=2))
    print(f"Wrote {len(out)} assignments to {out_path}") 