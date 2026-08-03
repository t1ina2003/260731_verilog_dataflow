// 子模組 B：資料倍增模組
module submod_b(
    input  wire       clk,
    input  wire       rst_n,
    input  wire [7:0] in_val,
    output reg  [7:0] out_val
);

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            out_val <= 8'h00;
        end else begin
            out_val <= in_val << 1;
        end
    end

endmodule
