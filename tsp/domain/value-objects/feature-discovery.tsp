import "../../common/scalars.tsp";

@doc("Provenance of a capability already implemented in the repository")
model FeatureDiscovery {
  key: string;
  evidencePaths: string[];
  analyzedAt: utcDateTime;
}
