# Verilog Dataflow Tracker

A VS Code extension that helps you trace Verilog signal dataflow by showing signal paths when hovering over variables.

## Features

- **Signal Tracing**: Hover over any Verilog signal to see its complete dataflow path
- **Block Diagram Visualization (區塊圖視覺化)**: Right-click on any signal and select **"加入至 Dataflow 區塊圖 (Add to Block Diagram)"** to visualize the signal flow across modules as an interactive hardware block diagram.
- **Multiple Dataflow Overlay**: Supports adding and managing multiple signal flows simultaneously with distinct color coding, toggle visibility, and deletion.
- **Interactive Navigation & Controls**:
  - Click any module block or port in the diagram to navigate directly to the corresponding Verilog code definition.
  - Infinite smooth Canvas Pan, Zoom, Fit View, and custom block dragging.
- **Hierarchical Tracking**: Traces signals through module instantiations (both up and down the hierarchy)
- **Automatic Parsing**: Automatically parses all `.v` and `.sv` files in your workspace
- **Real-time Updates**: Monitors file changes and updates the signal database

## Usage

1. Open a Verilog project in VS Code
2. **Hover Tracing**: Hover over any signal name to see the full text path
3. **Block Diagram Visualization**:
   - Right-click on a signal name (or selected text) in the editor
   - Select **「加入至 Dataflow 區塊圖 (Add to Block Diagram)」**
   - The Block Diagram window will open side-by-side displaying the modules, ports, and signal flow
   - Repeat for other signals to overlay multiple dataflows in different colors!

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

MIT
