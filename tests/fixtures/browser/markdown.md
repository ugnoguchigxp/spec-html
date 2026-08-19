# Markdown design

This fixture verifies **Markdown preview** with a [relative HTML link](./overview.html#details).

![Fixture pixel](./assets/pixel.svg)

## 2026 results

| Format | Count |
| :--- | ---: |
| Markdown | 1 |

```mermaid
flowchart LR
  Markdown --> HTML
  click HTML call markdownMermaidCallback()
```

<script>window.markdownRawScriptExecuted = true</script>

[Unsafe link](javascript:window.markdownUnsafeLinkExecuted=true)
