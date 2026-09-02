from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Literal
from enum import Enum

class SolverObjective(str, Enum):
    MIN_TRIM = "MIN_TRIM"
    MIN_PATTERNS = "MIN_PATTERNS"
    BALANCED = "BALANCED"

class ItemPriority(str, Enum):
    URGENT = "URGENT"
    NORMAL = "NORMAL"
    STOCK = "STOCK"

class MachineModel(BaseModel):
    id: str
    name: str
    max_deckle_inch: float = Field(gt=0, description="Maximum deckle in inches")
    min_deckle_inch: float = Field(gt=0, description="Minimum deckle in inches")
    min_trim_inch: float = Field(ge=0, default=0.5, description="Minimum edge trim")
    max_trim_inch: float = Field(gt=0, default=6.0, description="Maximum allowed trim waste")
    min_gsm: int = Field(gt=0, default=80)
    max_gsm: int = Field(gt=0, default=300)
    max_capacity_hours: Optional[float] = Field(default=None, description="Maximum weekly/monthly hours available")

    @field_validator("max_deckle_inch")
    @classmethod
    def validate_deckle(cls, v, info):
        return v

class OrderItemModel(BaseModel):
    order_item_id: str
    order_number: Optional[str] = None
    width_inch: float = Field(gt=0, description="Customer demanded reel width in inches")
    gsm: int = Field(gt=0, description="Grams per square meter")
    quantity_kg: float = Field(ge=0, description="Demanded quantity in kg (0 for stock presets)")
    tolerance_percent: float = Field(ge=0, le=50, default=5.0)
    priority: ItemPriority = Field(default=ItemPriority.NORMAL)
    delivery_date: Optional[str] = None

class SolverOptions(BaseModel):
    objective: SolverObjective = Field(default=SolverObjective.MIN_TRIM)
    max_patterns_per_run: int = Field(default=20, ge=1, le=50)
    max_distinct_widths_per_pattern: int = Field(default=6, ge=1, le=10)
    allow_overproduction: bool = Field(default=True)
    use_stock_presets: bool = Field(default=False)
    time_limit_seconds: int = Field(default=30, ge=1, le=120)

class OptimizeRequest(BaseModel):
    machines: List[MachineModel] = Field(min_length=1)
    items: List[OrderItemModel] = Field(default_factory=list)
    options: SolverOptions = Field(default_factory=SolverOptions)

class PatternCutModel(BaseModel):
    order_item_id: str
    width_inch: float
    count: int

class PatternModel(BaseModel):
    sequence: int
    repetitions: int
    run_length_m: float = 0.0  # Exact meter length from solver (source of truth for weight calc)
    cuts: List[PatternCutModel]
    used_width_inch: float
    trim_width_inch: float
    trim_percent: float
    estimated_kg: float

class ProductionRunModel(BaseModel):
    machine_id: str
    gsm: int
    total_trim_percent: float
    total_planned_kg: float
    patterns: List[PatternModel]

class UnassignedItemModel(BaseModel):
    order_item_id: str
    order_number: Optional[str] = None
    width_inch: Optional[float] = None
    gsm: Optional[int] = None
    reason: str

class SolverSummaryModel(BaseModel):
    total_trim_percent: float
    total_kg: float
    machines_used: int
    runs_created: int
    solve_time_ms: int

class OptimizeResponse(BaseModel):
    runs: List[ProductionRunModel]
    unassigned_items: List[UnassignedItemModel]
    summary: SolverSummaryModel
    warnings: List[str] = Field(default_factory=list)
