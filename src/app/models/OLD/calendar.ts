export interface Calendar {
  id: number;
  transport_line_id: number;
  type: string[]; // es. ["strike"], ["weekend"], ecc.
}