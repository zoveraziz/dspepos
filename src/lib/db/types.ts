export interface TransactionRecord {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM:SS or display time
  type: "SALE" | "PURCHASE";
  amount: number;
  serial_no: number; // Customer serial for the day (e.g. 1, 2, 3...)
  notes?: string;
  created_at: string;
  updated_at: string;
  is_deleted?: number;
}

export interface DailySummaryRow {
  date: string;
  total_purchase: number;
  total_sale: number;
  remaining_stock: number;
  sales_count: number;
}

export interface SyncMutation {
  mutation_id: string;
  record_id: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  payload: string;
  status: "PENDING" | "SYNCING" | "FAILED";
  retry_count: number;
  created_at: string;
}

export interface DbTransactionStatement {
  sql: string;
  params?: any[];
}
