import time
import math
from typing import List, Dict, Tuple, Set, Optional, Any
from collections import defaultdict
from ortools.sat.python import cp_model
from ortools.linear_solver import pywraplp

from models import (
    MachineModel,
    OrderItemModel,
    SolverOptions,
    SolverObjective,
    ItemPriority,
    OptimizeRequest,
    OptimizeResponse,
    ProductionRunModel,
    PatternModel,
    PatternCutModel,
    UnassignedItemModel,
    SolverSummaryModel,
)

SCALE = 100  # integer hundredths of an inch
L_step = 1.0  # 1 meter continuous resolution for exact weight matching
MACHINE_SPEED_M_PER_HR = 18000.0  # Assume 300 m/min

class PatternCandidate:
    def __init__(self, cuts: Dict[str, int], used_width_int: int, deckle_int: int):
        self.cuts = cuts
        self.used_width_int = used_width_int
        self.deckle_int = deckle_int
        self.trim_width_int = deckle_int - used_width_int

    @property
    def used_width_inch(self) -> float:
        return round(self.used_width_int / SCALE, 2)

    @property
    def trim_width_inch(self) -> float:
        return round(self.trim_width_int / SCALE, 2)

    @property
    def trim_percent(self) -> float:
        if self.deckle_int <= 0:
            return 0.0
        return round((self.trim_width_int / self.deckle_int) * 100.0, 2)


def get_item_metrics(items: List[OrderItemModel], gsm: int) -> Dict[str, Dict[str, Any]]:
    metrics = {}
    for it in items:
        width_m = it.width_inch * 0.0254
        kg_per_m = width_m * (gsm / 1000.0)
        kg_per_unit = kg_per_m * L_step

        if it.priority == ItemPriority.STOCK or it.quantity_kg <= 0:
            min_kg = 0.0
            max_kg = 0.0
            target_kg = 0.0
        else:
            tol_frac = it.tolerance_percent / 100.0
            min_kg = it.quantity_kg * (1.0 - tol_frac)
            max_kg = it.quantity_kg * (1.0 + tol_frac * 1.5)
            target_kg = it.quantity_kg

        metrics[it.order_item_id] = {
            "width_m": width_m,
            "kg_per_m": kg_per_m,
            "kg_per_unit": kg_per_unit,
            "unit_scale_int": max(1, int(round(kg_per_unit * 10.0))),
            "min_scale_int": int(round(min_kg * 10.0)),
            "max_scale_int": int(round(max_kg * 10.0)),
            "target_scale_int": int(round(target_kg * 10.0)),
            "target_kg": target_kg,
            "width_int": int(round(it.width_inch * SCALE)),
        }
    return metrics


def generate_initial_patterns(items: List[OrderItemModel], machine: MachineModel) -> List[PatternCandidate]:
    patterns = []
    deckle_int = int(round(machine.max_deckle_inch * SCALE))
    min_trim_int = int(round(machine.min_trim_inch * SCALE))
    max_usable = deckle_int - min_trim_int

    for it in items:
        w_int = int(round(it.width_inch * SCALE))
        reps = max(1, max_usable // w_int)
        used = reps * w_int
        # Initialize identity patterns to seed LP master
        patterns.append(PatternCandidate({it.order_item_id: reps}, used, deckle_int))
    return patterns


def solve_cg_lp_master(
    patterns: List[PatternCandidate],
    item_metrics: Dict[str, Dict[str, Any]],
    items: List[OrderItemModel],
    allow_overproduction: bool,
) -> Tuple[Dict[str, float], List[float], int, float]:
    solver = pywraplp.Solver.CreateSolver('GLOP')
    
    items_by_id = {it.order_item_id: it for it in items}
    
    x = []
    for p in range(len(patterns)):
        x.append(solver.NumVar(0, solver.infinity(), f'x_{p}'))
        
    under = {}
    over = {}
    constraints = {}
    
    for it in items:
        oid = it.order_item_id
        target = item_metrics[oid]['target_scale_int']
        
        if it.priority == ItemPriority.STOCK:
            under[oid] = solver.NumVar(0, 0, f'under_{oid}')
            over[oid] = solver.NumVar(0, solver.infinity(), f'over_{oid}')
        else:
            under[oid] = solver.NumVar(0, target, f'under_{oid}')
            if allow_overproduction:
                over[oid] = solver.NumVar(0, target * 2, f'over_{oid}')
            else:
                over[oid] = solver.NumVar(0, 0, f'over_{oid}')
            
        ct = solver.Constraint(target, target, f'ct_{oid}')
        ct.SetCoefficient(under[oid], 1.0)
        ct.SetCoefficient(over[oid], -1.0)
        constraints[oid] = ct

    for p, pat in enumerate(patterns):
        for oid, count in pat.cuts.items():
            if oid in constraints:
                u_scale = float(item_metrics[oid]['unit_scale_int'])
                constraints[oid].SetCoefficient(x[p], count * u_scale)
                
    objective = solver.Objective()
    for p, pat in enumerate(patterns):
        objective.SetCoefficient(x[p], float(pat.trim_width_int))
        
    for oid in under:
        if items_by_id[oid].priority == ItemPriority.STOCK:
            objective.SetCoefficient(under[oid], 0.0)
            objective.SetCoefficient(over[oid], 1.0)   # Small penalty favors making stock over trim
        else:
            objective.SetCoefficient(under[oid], 50000.0)  # Demand fulfillment is strictly prioritized
            objective.SetCoefficient(over[oid], 50.0)
        
    objective.SetMinimization()
    status = solver.Solve()
    
    duals = {}
    primal_x = []
    obj_val = 0.0
    
    if status == pywraplp.Solver.OPTIMAL:
        obj_val = objective.Value()
        for oid in constraints:
            duals[oid] = constraints[oid].dual_value()
        for p in range(len(patterns)):
            primal_x.append(x[p].solution_value())
            
    return duals, primal_x, status, obj_val


def solve_cg_subproblem(
    item_metrics: Dict[str, Dict[str, Any]],
    machine: MachineModel,
    duals: Dict[str, float],
    options: SolverOptions,
) -> Tuple[Optional[PatternCandidate], float]:
    model = cp_model.CpModel()
    
    deckle_int = int(round(machine.max_deckle_inch * SCALE))
    min_trim_int = int(round(machine.min_trim_inch * SCALE))
    max_trim_int = int(round(machine.max_trim_inch * SCALE))
    max_usable = deckle_int - min_trim_int
    min_usable = max(0, deckle_int - max_trim_int)
    
    c = {}
    u = {}
    for oid, metrics in item_metrics.items():
        w_int = metrics['width_int']
        max_c = max_usable // w_int
        if max_c > 0:
            c[oid] = model.NewIntVar(0, max_c, f"c_{oid}")
            u[oid] = model.NewBoolVar(f"u_{oid}")
            model.Add(c[oid] >= 1).OnlyEnforceIf(u[oid])
            model.Add(c[oid] == 0).OnlyEnforceIf(u[oid].Not())
            
    if not c:
        return None, 0.0
        
    # Apply CG DFS constraints
    model.Add(sum(u.values()) <= options.max_distinct_widths_per_pattern)
    model.Add(sum(u.values()) >= 1)
    
    used_width = sum(c[oid] * item_metrics[oid]['width_int'] for oid in c)
    model.Add(used_width <= max_usable)
    model.Add(used_width >= min_usable)
    
    profit_vars = []
    for oid in c:
        w_int = item_metrics[oid]['width_int']
        dual = duals.get(oid, 0.0)
        u_scale = float(item_metrics[oid]['unit_scale_int'])
        profit = int(round((w_int + dual * u_scale) * 1000.0))
        profit_vars.append(c[oid] * profit)
        
    model.Maximize(sum(profit_vars))
    
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 1.0
    status = solver.Solve(model)
    
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        best_profit = solver.ObjectiveValue() / 1000.0
        reduced_cost = deckle_int - best_profit
        
        # Stabilization: strictly negative reduced cost requirement
        if reduced_cost < -0.01:
            cuts = {}
            used_w = 0
            for oid in c:
                val = solver.Value(c[oid])
                if val > 0:
                    cuts[oid] = val
                    used_w += val * item_metrics[oid]['width_int']
            if cuts:
                return PatternCandidate(cuts, used_w, deckle_int), reduced_cost
                
    return None, 0.0


def column_generation_loop(
    items: List[OrderItemModel],
    item_metrics: Dict[str, Dict[str, Any]],
    machine: MachineModel,
    options: SolverOptions,
    time_limit: float,
) -> Tuple[List[PatternCandidate], List[float]]:
    start_time = time.time()
    patterns = generate_initial_patterns(items, machine)
    
    best_primal_x: List[float] = []
    max_cg_iters = 30
    
    for i in range(max_cg_iters):
        elapsed = time.time() - start_time
        if elapsed > time_limit * 0.5:
            break
            
        duals, primal_x, status, obj_val = solve_cg_lp_master(
            patterns, item_metrics, items, options.allow_overproduction
        )
        
        if status != pywraplp.Solver.OPTIMAL:
            break
            
        best_primal_x = primal_x
        
        new_pattern, rc = solve_cg_subproblem(item_metrics, machine, duals, options)
        
        if new_pattern:
            key = tuple(sorted(new_pattern.cuts.items()))
            if any(tuple(sorted(p.cuts.items())) == key for p in patterns):
                break # Anti-cycling
            patterns.append(new_pattern)
        else:
            break # LP relaxation is optimal

    # Solve one final master LP so primal_x has exact length of patterns
    duals, primal_x, status, obj_val = solve_cg_lp_master(
        patterns, item_metrics, items, options.allow_overproduction
    )
    if status == pywraplp.Solver.OPTIMAL:
        best_primal_x = primal_x
    else:
        while len(best_primal_x) < len(patterns):
            best_primal_x.append(0.0)
            
    return patterns, best_primal_x


def solve_production_run(
    items: List[OrderItemModel],
    item_metrics: Dict[str, Dict[str, Any]],
    patterns: List[PatternCandidate],
    primal_x: List[float],
    machine: MachineModel,
    options: SolverOptions,
    time_limit: float = 10.0,
) -> Tuple[Optional[ProductionRunModel], List[UnassignedItemModel], List[str]]:
    warnings: List[str] = []
    unassigned: List[UnassignedItemModel] = []
    
    if not items or not patterns:
        return None, unassigned, warnings
        
    item_lookup = {it.order_item_id: it for it in items}
    gsm = items[0].gsm
    
    model = cp_model.CpModel()
    P_len = len(patterns)
    
    max_units = int(math.ceil(max(it.quantity_kg for it in items) / (min(m["kg_per_unit"] for m in item_metrics.values()))) * 3)
    max_units = max(200, max_units)

    x = [model.NewIntVar(0, max_units, f"x_{p}") for p in range(P_len)]
    u = [model.NewBoolVar(f"u_{p}") for p in range(P_len)]

    for p in range(P_len):
        model.Add(x[p] >= 1).OnlyEnforceIf(u[p])
        model.Add(x[p] == 0).OnlyEnforceIf(u[p].Not())

    model.Add(sum(u) <= options.max_patterns_per_run)
    model.Add(sum(u) >= 1)

    penalties = []
    for it in items:
        oid = it.order_item_id
        u_scale = item_metrics[oid]["unit_scale_int"]
        target_scale = item_metrics[oid]["target_scale_int"]

        cut_terms = []
        for p, pat in enumerate(patterns):
            cut_count = pat.cuts.get(oid, 0)
            if cut_count > 0:
                cut_terms.append(x[p] * (cut_count * u_scale))

        if not cut_terms:
            continue

        produced_expr = sum(cut_terms)
        
        if item_lookup[oid].priority == ItemPriority.STOCK:
            under_slack = model.NewIntVar(0, 0, f"under_{oid}")
            over_slack = model.NewIntVar(0, 100000, f"over_{oid}") # large bound
            model.Add(produced_expr - over_slack == 0)
            penalties.append(over_slack * 10)
        else:
            under_slack = model.NewIntVar(0, target_scale, f"under_{oid}")
            
            if options.allow_overproduction:
                over_slack = model.NewIntVar(0, target_scale * 2, f"over_{oid}")
            else:
                over_slack = model.NewIntVar(0, 0, f"over_{oid}")

            model.Add(produced_expr + under_slack - over_slack == target_scale)

            penalties.append(under_slack * 100000)  # Demand fulfillment strictly mandatory
            penalties.append(over_slack * 50)

    trim_cost = sum(x[p] * patterns[p].trim_width_int for p in range(P_len))
    pattern_cost = sum(u)

    priority_bonus = []
    for p, pat in enumerate(patterns):
        has_urgent = any(item_lookup[oid].priority == ItemPriority.URGENT for oid in pat.cuts.keys())
        if has_urgent:
            priority_bonus.append(x[p] * -50)

    if options.objective == SolverObjective.MIN_TRIM:
        model.Minimize(trim_cost * 10 + pattern_cost * 10000 + sum(penalties) + sum(priority_bonus))
    elif options.objective == SolverObjective.MIN_PATTERNS:
        model.Minimize(pattern_cost * 100000 + trim_cost * 5 + sum(penalties) + sum(priority_bonus))
    else:  # BALANCED
        model.Minimize(trim_cost * 8 + pattern_cost * 30000 + sum(penalties) + sum(priority_bonus))

    # Warm Start with CG solution
    if primal_x and len(primal_x) == P_len:
        for p in range(P_len):
            val = int(round(primal_x[p]))
            model.AddHint(x[p], val)
            model.AddHint(u[p], 1 if val > 0 else 0)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(time_limit)
    solver.parameters.num_workers = 4

    status = solver.Solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for it in items:
            unassigned.append(
                UnassignedItemModel(
                    order_item_id=it.order_item_id,
                    order_number=it.order_number,
                    width_inch=it.width_inch,
                    gsm=it.gsm,
                    reason=f"Demanded quantity ({it.quantity_kg} kg) cannot be fulfilled within constraints.",
                )
            )
        return None, unassigned, warnings

    active_patterns: List[PatternModel] = []
    total_produced_kg = 0.0
    total_deckle_area_m2 = 0.0
    total_trim_area_m2 = 0.0
    machine_deckle_m = machine.max_deckle_inch * 0.0254

    seq = 1
    for p in range(P_len):
        units = solver.Value(x[p])
        if units > 0:
            pat = patterns[p]
            run_length_m = units * L_step

            pattern_weight_kg = 0.0
            pattern_cuts: List[PatternCutModel] = []
            for oid, count in pat.cuts.items():
                it = item_lookup[oid]
                w_m = it.width_inch * 0.0254
                cut_kg = (w_m * run_length_m * (gsm / 1000.0)) * count
                pattern_weight_kg += cut_kg
                pattern_cuts.append(
                    PatternCutModel(
                        order_item_id=oid,
                        width_inch=it.width_inch,
                        count=count,
                    )
                )

            total_produced_kg += pattern_weight_kg
            pat_deckle_m2 = machine_deckle_m * run_length_m
            pat_trim_m2 = (pat.trim_width_inch * 0.0254) * run_length_m

            total_deckle_area_m2 += pat_deckle_m2
            total_trim_area_m2 += pat_trim_m2

            reps = max(1, int(round(run_length_m / 1000.0)))

            active_patterns.append(
                PatternModel(
                    sequence=seq,
                    repetitions=reps,
                    run_length_m=round(run_length_m, 2),
                    cuts=pattern_cuts,
                    used_width_inch=pat.used_width_inch,
                    trim_width_inch=pat.trim_width_inch,
                    trim_percent=pat.trim_percent,
                    estimated_kg=round(pattern_weight_kg, 2),
                )
            )
            seq += 1

    # Run sequence: URGENT-containing patterns first (irrespective of order
    # date), then everything else in FIFO order by the oldest order date
    # among each pattern's cuts (undated items sort last within their tier).
    def _pattern_sort_key(p: PatternModel):
        has_urgent = any(item_lookup[c.order_item_id].priority == ItemPriority.URGENT for c in p.cuts)
        order_dates = [
            item_lookup[c.order_item_id].order_date
            for c in p.cuts
            if item_lookup[c.order_item_id].order_date
        ]
        earliest_date = min(order_dates) if order_dates else "9999-99-99"
        return (0 if has_urgent else 1, earliest_date)

    active_patterns.sort(key=_pattern_sort_key)
    for idx, p in enumerate(active_patterns):
        p.sequence = idx + 1

    total_trim_pct = (
        round((total_trim_area_m2 / total_deckle_area_m2) * 100.0, 2)
        if total_deckle_area_m2 > 0 else 0.0
    )

    run_model = ProductionRunModel(
        machine_id=machine.id,
        gsm=gsm,
        total_trim_percent=total_trim_pct,
        total_planned_kg=round(total_produced_kg, 2),
        patterns=active_patterns,
    )

    return run_model, unassigned, warnings


def optimize_deckle(req: OptimizeRequest) -> OptimizeResponse:
    start_time = time.time()
    warnings: List[str] = []
    unassigned_items: List[UnassignedItemModel] = []
    runs: List[ProductionRunModel] = []

    if not req.items:
        return OptimizeResponse(
            runs=[], unassigned_items=[],
            summary=SolverSummaryModel(total_trim_percent=0.0, total_kg=0.0, machines_used=0, runs_created=0, solve_time_ms=0),
            warnings=["No items provided for optimization."]
        )

    max_global_deckle = max(m.max_deckle_inch for m in req.machines)
    valid_items: List[OrderItemModel] = []

    for it in req.items:
        if it.width_inch > max_global_deckle:
            unassigned_items.append(UnassignedItemModel(
                order_item_id=it.order_item_id, order_number=it.order_number, width_inch=it.width_inch, gsm=it.gsm,
                reason=f"Width {it.width_inch}\" exceeds maximum machine deckle of {max_global_deckle}\"."
            ))
            continue
        gsm_supported = [m for m in req.machines if m.min_gsm <= it.gsm <= m.max_gsm]
        if not gsm_supported:
            unassigned_items.append(UnassignedItemModel(
                order_item_id=it.order_item_id, order_number=it.order_number, width_inch=it.width_inch, gsm=it.gsm,
                reason=f"GSM {it.gsm} is outside operating range of all active machines."
            ))
            continue
        valid_items.append(it)

    gsm_groups: Dict[int, List[OrderItemModel]] = defaultdict(list)
    for it in valid_items:
        gsm_groups[it.gsm].append(it)

    # Only process GSM groups that have at least one demand item with quantity_kg > 0
    gsm_groups = {
        gsm: items
        for gsm, items in gsm_groups.items()
        if any(it.quantity_kg > 0 and it.priority != ItemPriority.STOCK for it in items)
    }

    time_per_eval = max(3.0, req.options.time_limit_seconds / max(1, len(gsm_groups)))

    # Phase 1: Fast CG LP evaluations for all valid (GSM, Machine) pairs
    pair_estimates = {}
    for gsm, group_items in gsm_groups.items():
        metrics = get_item_metrics(group_items, gsm)
        eligible = [m for m in req.machines if m.min_gsm <= gsm <= m.max_gsm]
        
        for m in eligible:
            pats, px = column_generation_loop(group_items, metrics, m, req.options, time_limit=max(2.0, time_per_eval * 0.2))
            
            n_eval = min(len(px), len(pats)) if px else 0
            est_trim_area = sum(px[i] * pats[i].trim_width_int for i in range(n_eval)) if n_eval > 0 else float('inf')
            total_units = sum(px) if px else 0
            est_hours = (total_units * L_step) / MACHINE_SPEED_M_PER_HR
            
            pair_estimates[(gsm, m.id)] = {
                'trim_estimate': est_trim_area,
                'est_hours': est_hours,
                'patterns': pats,
                'primal_x': px,
                'machine': m,
                'metrics': metrics
            }

    # Phase 2: Global Machine Arbitration LP
    assign_solver = pywraplp.Solver.CreateSolver('GLOP')
    assign_vars = {}
    for gsm in gsm_groups:
        for m in req.machines:
            if (gsm, m.id) in pair_estimates:
                assign_vars[(gsm, m.id)] = assign_solver.NumVar(0, 1, f'assign_{gsm}_{m.id}')

    for gsm in gsm_groups:
        vs = [assign_vars[(gsm, m.id)] for m in req.machines if (gsm, m.id) in assign_vars]
        if vs:
            ct = assign_solver.Constraint(1, 1, f'assign_gsm_{gsm}')
            for v in vs:
                ct.SetCoefficient(v, 1)

    for m in req.machines:
        if getattr(m, 'max_capacity_hours', None) is not None:
            vs = [assign_vars[(gsm, m.id)] for gsm in gsm_groups if (gsm, m.id) in assign_vars]
            if vs:
                ct = assign_solver.Constraint(0, m.max_capacity_hours, f'cap_{m.id}')
                for gsm in gsm_groups:
                    if (gsm, m.id) in assign_vars:
                        ct.SetCoefficient(assign_vars[(gsm, m.id)], pair_estimates[(gsm, m.id)]['est_hours'])

    assign_obj = assign_solver.Objective()
    for (gsm, mid), v in assign_vars.items():
        assign_obj.SetCoefficient(v, pair_estimates[(gsm, mid)]['trim_estimate'])
    assign_obj.SetMinimization()

    assign_status = assign_solver.Solve()

    assigned_pairs = []
    if assign_status == pywraplp.Solver.OPTIMAL:
        for (gsm, mid), v in assign_vars.items():
            if v.solution_value() > 0.5:
                assigned_pairs.append((gsm, pair_estimates[(gsm, mid)]['machine']))
    else:
        warnings.append("Global capacity constraint was infeasible. Falling back to greedy unconstrained machine assignment.")
        for gsm in gsm_groups:
            best_m = None
            best_val = float('inf')
            for m in req.machines:
                if (gsm, m.id) in pair_estimates and pair_estimates[(gsm, m.id)]['trim_estimate'] < best_val:
                    best_val = pair_estimates[(gsm, m.id)]['trim_estimate']
                    best_m = m
            if best_m:
                assigned_pairs.append((gsm, best_m))

    # Phase 3: Final CP-SAT Integer Solve on Assigned Pairs
    for gsm, mach in assigned_pairs:
        est = pair_estimates[(gsm, mach.id)]
        
        run_res, unassign_res, warn_res = solve_production_run(
            items=gsm_groups[gsm],
            item_metrics=est['metrics'],
            patterns=est['patterns'],
            primal_x=est['primal_x'],
            machine=mach,
            options=req.options,
            time_limit=time_per_eval * 0.8,
        )

        if run_res:
            runs.append(run_res)
            unassigned_items.extend(unassign_res)
            warnings.extend(warn_res)
            
            eligible = [m for m in req.machines if m.min_gsm <= gsm <= m.max_gsm]
            if len(eligible) > 1:
                warnings.append(f"GSM {gsm} run assigned to {mach.name} yielding {run_res.total_trim_percent}% trim waste via global arbitration.")
        else:
            for it in gsm_groups[gsm]:
                unassigned_items.append(
                    UnassignedItemModel(
                        order_item_id=it.order_item_id, order_number=it.order_number,
                        width_inch=it.width_inch, gsm=it.gsm,
                        reason="Could not fulfill demand within tolerance and deckle constraints."
                    )
                )

    total_planned_kg = sum(r.total_planned_kg for r in runs)
    used_machines = set(r.machine_id for r in runs)
    total_trim_pct = round(sum(r.total_trim_percent * r.total_planned_kg for r in runs) / max(1.0, total_planned_kg), 2) if runs else 0.0

    return OptimizeResponse(
        runs=runs,
        unassigned_items=unassigned_items,
        summary=SolverSummaryModel(
            total_trim_percent=total_trim_pct,
            total_kg=round(total_planned_kg, 2),
            machines_used=len(used_machines),
            runs_created=len(runs),
            solve_time_ms=int((time.time() - start_time) * 1000),
        ),
        warnings=warnings,
    )
