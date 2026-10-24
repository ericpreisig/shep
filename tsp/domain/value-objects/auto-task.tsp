import "../../common/scalars.tsp";

@doc("A deferred feature in an automatically generated dependency plan")
model AutoTaskPlannedFeature {
  id: UUID;
  name: string;
  description: string;
  parentIds: UUID[];
}

@doc("Durable AutoTask plan, saved before any child is created")
model AutoTaskPlan {
  tasks: AutoTaskPlannedFeature[];
  parentIds: UUID[];
  ready: boolean;
}

@doc("Opt-in planning and child provenance; separate from prerequisite edges")
model AutoTaskState {
  enabled: boolean;
  sourceFeatureId?: UUID;
  plan?: AutoTaskPlan;
  error?: string;
}
