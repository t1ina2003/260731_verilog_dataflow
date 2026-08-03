// 頂層模組：示範多層階層與多條 Dataflow 連線
module top(
    input  wire        clk,
    input  wire        rst_n,
    input  wire [7:0]  din_a,
    input  wire [7:0]  din_b,
    output wire [15:0] result_out
);

    wire [7:0] data_bus_1;
    wire [7:0] data_bus_2;
    wire [15:0] alu_res;

    // 實例化子模組 A
    submod_a u_sub_a (
        .clk(clk),
        .rst_n(rst_n),
        .data_in(din_a),
        .data_out(data_bus_1)
    );

    // 實例化子模組 B
    submod_b u_sub_b (
        .clk(clk),
        .rst_n(rst_n),
        .in_val(din_b),
        .out_val(data_bus_2)
    );

    // 實例化 ALU 運算模組
    alu u_alu (
        .clk(clk),
        .op_a(data_bus_1),
        .op_b(data_bus_2),
        .res(alu_res)
    );

    assign result_out = alu_res;

endmodule
