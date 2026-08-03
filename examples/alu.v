// 運算單元模組 (ALU)
module alu(
    input  wire        clk,
    input  wire [7:0]  op_a,
    input  wire [7:0]  op_b,
    output reg  [15:0] res
);

    always @(posedge clk) begin
        res <= op_a * op_b;
    end

endmodule
