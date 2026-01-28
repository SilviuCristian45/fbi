export type ResponseType = "Success" | "Warn" | "Error";

export interface ApiResponse<T> {
  data: T;
  message: string[];
  type: ResponseType;
}