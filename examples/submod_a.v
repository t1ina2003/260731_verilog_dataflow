// 子模組 A：資料暫存與前處理
module submod_a(
    input  wire       clk,
    input  wire       rst_n,
    input  wire [7:0] data_in,
    output reg  [7:0] data_out
);

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            data_out <= 8'h00;
        end else begin
            data_out <= data_in + 8'h01;
        end
    end

endmodule
