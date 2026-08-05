# Verilog Dataflow Tracker

A VS Code extension that helps you trace Verilog signal dataflow by showing signal paths when hovering over variables.

## Features

- **Signal Tracing**: Hover over any Verilog signal to see its complete dataflow path
- **Hierarchical Tracking**: Traces signals through module instantiations (both up and down the hierarchy)
- **Automatic Parsing**: Automatically parses all `.v` and `.sv` files in your workspace
- **Real-time Updates**: Monitors file changes and updates the signal database

## Usage

1. Open a Verilog project in VS Code
2. Hover over any signal name
3. View the complete dataflow path showing:
   - Parent module connections (top-down)
   - Child module connections (bottom-up)
   - Full signal path through the design hierarchy

## Example

When hovering over a signal `data_in`, you might see:
```
top.clk -> submod.data_in -> submod.instance.port_a
```

## Requirements

- VS Code 1.90.0 or higher
- Verilog or SystemVerilog files (`.v`, `.sv`)

## Known Limitations

- Array indices in signal connections are simplified
- Does not parse complex parameter expressions
- Requires valid Verilog syntax

## Release Notes

### 0.0.1

Initial release with basic dataflow tracking functionality.

## Contributing

Issues and pull requests are welcome!

## License

This software is released under a **Proprietary Freeware License (EULA)**.
- **Free for Personal, Academic & Commercial Use** (允許個人、學術及企業內部免費使用)
- **Zero Telemetry / 100% Offline** (零資料收集，完全本地端執行)
- For full terms, please refer to [LICENSE.md](LICENSE.md).
