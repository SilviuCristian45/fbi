export interface PagedResult<T> {
  totalCount: number;
  items: T[];
}

export interface WantedPersonSummary {
  id: number;
  title: string;
  description?: string;
  rewardText?: string;
  mainImageUrl?: string;
  publicationDate?: string;
}

export interface WantedPersonDetail {
  id: number;
  title: string;
  description?: string;
  details?: string;
  caution?: string;
  rewardText?: string;
  sex?: string;
  race?: string;
  hair?: string;
  eyes?: string;
  images: string[];
  aliases: string[];
  subjects: string[];
}

export interface WantedPersonDetail {
  id: number;
  title: string;
  description?: string;
  details?: string; // HTML content
  caution?: string; // HTML content
  rewardText?: string;
  
  // Caracteristici
  sex?: string;
  race?: string;
  hair?: string;
  eyes?: string;
  
  // Liste
  images: string[];
  aliases: string[];
  subjects: string[];
}