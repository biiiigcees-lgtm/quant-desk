# Kafka Event Backbone

This scaffold defines how to plug a durable log transport under the internal event bus.

## Topics

- `market.data`
- `features.derived`
- `probability.estimated`
- `signal.aggregated`
- `risk.decision`
- `execution.plan`
- `portfolio.update`
- `drift.event`
- `research.note`

## Notes

- Keep event payloads aligned to contracts in `core/schemas/events.ts`.
- Partition by `contractId` for ordering of per-contract decisions.
- Use idempotent consumers for replay-safe ingestion.
