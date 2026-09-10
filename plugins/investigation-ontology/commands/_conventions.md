# Command Conventions

Every non-underscore file in `commands/` is a plugin slash-command workflow.

## Naming

- File names use lower-case kebab-case, for example `investigate.md`.
- Document invocations with the plugin namespace, for example `/efio:investigate`.

## Required Sections

Each command should include:

- frontmatter with `description`
- command title
- usage examples
- workflow steps
- files read or written
- related skills and agents
- validation or review checks

## Execution Expectations

Commands should be deterministic where possible. They should state what Codex should inspect, what artifacts it may create or update, and which checks should run before or after file writes.

## Investigation Safety

Commands must preserve the human investigator's responsibility for decisions. They must not fabricate evidence, conceal uncertainty, or turn tentative analysis into unsupported findings.
