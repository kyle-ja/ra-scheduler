from typing import Dict, List

def solve_with_lexicographic_optimization(payload: Dict) -> List[Dict]:
    # First solve for fairness, then optimize for preferences
    
    # Phase 1: Minimize maximum individual cost
    model1 = create_base_model(payload)
    max_cost_var = add_fairness_objective(model1)
    solver.Solve(model1)
    max_cost_bound = solver.Value(max_cost_var)
    
    # Phase 2: With fairness constraint, maximize preferences
    model2 = create_base_model(payload)
    model2.Add(max_cost_var <= max_cost_bound)  # Maintain fairness
    model2.Maximize(total_preference_satisfaction)
    
    return solve_final_model(model2) 