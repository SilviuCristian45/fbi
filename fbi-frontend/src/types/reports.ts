// src/types/reports.ts
import { PagedResult } from "./wanted-person"; // Refolosim PagedResult existent

export enum ReportStatus {
  Pending = 0,
  Completed = 1,
  Failed = 2
}

export interface MatchItem {
  url: string;
  confidence: number;
}

export interface ReportItem {
  id: number;
  name: string; // Titlul raportului
  url: string;  // Poza incarcata de agent
  matches: MatchItem[]; // Lista de suspecti gasiti
  latitude: number;
  longitude: number;
  description: string;
  wantedId: number;
  status: ReportStatus;
}

// Folosim tipul generic PagedResult definit anterior
export type ReportPagedResult = PagedResult<ReportItem>;