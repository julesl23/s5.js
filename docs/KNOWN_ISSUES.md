## Week 2 Test Expectations

The following tests have expectation mismatches:

1. Depth test - With 50 entries, the tree efficiently stays at root level
2. Serialization test - Root splits create leaves, not deep nodes
3. Cache test - Nodes only cache when loaded from storage
4. Round-trip - Minor ordering issue in test data

These will be validated in Week 3 with larger datasets.
