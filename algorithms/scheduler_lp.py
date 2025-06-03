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
    # C2: No employee works >2 days in a row
    # ------------------------------------------------------------------
    for i in range(num_emp):
        for d in range(num_days - 2):
            # If an employee works day d and d+1, they cannot work day d+2
            # This is equivalent to x[i][d] + x[i][d+1] + x[i][d+2] <= 2
            model.Add(x[i][d] + x[i][d + 1] + x[i][d + 2] <= 2)

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
    unmet_top_n_prefs_per_employee = [] # Deviation from MIN_TOP_N_DAYS_GUARANTEE for Top-3 days

    for i in range(num_emp):
        # Total cost for employee i
        emp_cost_var = sum(cost_matrix[i][d] * x[i][d] for d in range(num_days))
        employee_total_costs.append(emp_cost_var)

        # Assignments to cost 100 days for employee i
        cost_100_sum = sum(x[i][d] for d in range(num_days) if cost_matrix[i][d] == 100)
        assignments_to_cost_100_days.append(cost_100_sum)
        
        # Unmet Top-N Preferences for employee i (soft constraint in objective)
        # This is how many *more* top-3 days they would need to reach the guarantee if C5 was soft
        # Or, can be used to push for even more than the hard C5 guarantee.
        # Let's focus on hard C5 and use objective for overall cost and max_cost.
        # Alternative: Penalty for not getting *enough* top-3 days (beyond C5)
        # num_top3_assigned = sum(x[i][d] for d in set(emp_top3_pref_day_indices[i]))
        # unmet_top3 = model.NewIntVar(0, num_days, f'unmet_top3_{i}')
        # model.Add(unmet_top3 >= MIN_TOP_N_DAYS_GUARANTEE - num_top3_assigned) # If positive, it's a shortfall
        # unmet_top_n_prefs_per_employee.append(unmet_top3)

    # P1: Minimize the maximum total cost for any single employee (Minimax cost)
    max_employee_total_cost = model.NewIntVar(0, num_days * 100, "max_employee_total_cost")
    for cost_var in employee_total_costs:
        model.Add(cost_var <= max_employee_total_cost)

    # P2: Minimize total number of assignments to highly undesirable (cost 100) days
    total_cost_100_assignments = sum(assignments_to_cost_100_days)
    
    # P3: Minimize sum of all employees' total costs (utilitarian)
    sum_of_all_employee_costs = sum(employee_total_costs)
    
    # Define weights for the hierarchical objective
    # Priority: 1. Maximize fairness (minimax cost), 2. Avoid very bad days, 3. Minimize overall cost
    W_MAX_COST = 10000  # Highest priority: Minimize the suffering of the worst-off employee
    W_COST_100 = 100    # Next: Avoid assigning cost-100 days
    W_TOTAL_COST = 1    # Finally: Minimize the sum of all costs

    model.Minimize(
        W_MAX_COST * max_employee_total_cost +
        W_COST_100 * total_cost_100_assignments +
        W_TOTAL_COST * sum_of_all_employee_costs
    )

    # ------------------------------------------------------------------
    # Solve
    # ------------------------------------------------------------------
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 25 # Adjusted for potentially more complex solve
    # solver.parameters.log_search_progress = True # Useful for debugging
    status = solver.Solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        error_message = f"Solver failed. Status: {solver.StatusName(status)}."
        if status == cp_model.INFEASIBLE:
            error_message += " Constraints might be too strict (e.g., C4 Rank-1 guarantee, C5 Top-N guarantee, or workload balance for the given number of employees/days)."
            # You could add more detailed infeasibility analysis here if OR-Tools provides it.
        elif status == cp_model.MODEL_INVALID:
            error_message += " The model formulation is invalid."
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