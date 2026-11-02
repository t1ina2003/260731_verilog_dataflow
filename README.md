# Verilog Dataflow Tracker

A VS Code extension that helps you trace Verilog signal dataflow by showing signal paths when hovering over variables.

## Features

- **Signal Tracing**: Hover over any Verilog signal to see its complete dataflow path
- **Hierarchical Tracking**: Traces signals through module instantiations (both up and down the hierarchy)
- **Hierarchical Parameter Resolution**: Hover over any `parameter` or `localparam` in a child/leaf module to directly view the resolved value passed down from the Top module
- **Automatic Parsing**: Automatically parses all `.v` and `.sv` files in your workspace
- **Real-time Updates**: Monitors file changes and updates the signal database

## Usage

1. Open a Verilog project in VS Code
2. Hover over any signal or parameter name
3. View the complete dataflow path showing:
   - Parent module connections (top-down)
   - Child module connections (bottom-up)
   - Full signal path through the design hierarchy
   - Resolved parameter values and propagation chains from the Top module

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
- Requires valid Verilog syntax

## Release Notes

### 0.0.3

- **Fix Parser Module Header Misidentification**: Prevented `module Name #(...) (...);` headers from being misidentified as module instantiations, restoring parent-module link tracing
- **Nested Parentheses Support**: Supported nested parentheses inside `#(...)` parameter blocks and port connection expressions
- **Hierarchical Parameter Value Resolution**: Hovering over a `parameter` or `localparam` in any child/leaf module now directly resolves and displays the final value passed down from the Top module along with the full parameter propagation chain

### 0.0.2

- Open-source release under the MIT License
- Updated extension icon and branding
- Re-packaged with 100% offline and zero-telemetry guarantee

### 0.0.1

Initial release with basic dataflow tracking functionality.

## Contributing

Issues and pull requests are welcome!

## License

This project is licensed under the [MIT License](LICENSE).
- **100% Offline & Zero Telemetry** (零資料收集，完全於本地端執行，確保硬體設計代碼安全)
