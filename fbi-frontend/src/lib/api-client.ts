import { ApiResponse } from "../types/api";
import { WantedPersonDetail } from "@/src/types/wanted-person";
import { SavePerson } from "../types/save-person";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

function normalizeUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url; // E deja complet
  }
  // Dacă nu are slash la început, adăugăm unul
  const cleanPath = url.startsWith("/") ? url : `/${url}`;
  return `${BASE_URL}${cleanPath}`;
}

export async function fetchWithGeneric<T>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const finalUrl = normalizeUrl(url);
  const response = await fetch(finalUrl, options);

  if (response.status === 401) {
    console.warn("Sesiune expirată. Redirectare spre login...");
    
    // Verificăm dacă suntem în browser ca să putem face redirect
    if (typeof window !== 'undefined') {
      // Opțional: Șterge token-ul vechi dacă îl ții în localStorage/Cookies
      localStorage.removeItem('token'); 
      
      // Redirect forțat
      window.location.href = '/auth/login';
    }
    // Oprim execuția aici ca să nu ajungă la eroarea de JSON
    throw new Error("Unauthorized");
  }
  
  const json = await response.json();

  if (!response.ok) {
    throw new Error(json.message?.join(", ") || "API Error");
  }

  return json as ApiResponse<T>;
}


export async function authFetch<T>(url: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const finalUrl = normalizeUrl(url);
  // 1. Pregătim Headers
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}), // Păstrăm și alte headere dacă au fost trimise
  } as Record<string, string>;

  // 2. Extragem Token-ul din LocalStorage (Doar pe client)
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }
  // 3. Apelăm fetch-ul generic cu noile headere
  return fetchWithGeneric<T>(finalUrl, {
    ...options,
    headers,
  });
}

export async function authFetchFile<T>(url: string, options: RequestInit = {}) {
  const finalUrl = normalizeUrl(url);
  // 1. Pregătim Headers
  const headers = {
    'Accept': 'application/pdf',
  } as Record<string, string>;

  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }
  return fetch(finalUrl, {
    ...options,
    headers,
  });
}


// Funcție nouă pentru detalii
export async function getWantedPersonById(id: string | number): Promise<ApiResponse<WantedPersonDetail>> {
  return authFetch<WantedPersonDetail>(`/FbiWanted/${id}`);
}

export async function saveFavourite(personId: number, save: boolean) {
  return authFetch<SavePerson>(`/FbiWanted/${personId}/${save}`, {method: 'POST'});
}

export async function reportLocation(wantedId: number, lat: number, lng: number, details: string, fileUrl: string): Promise<ApiResponse<boolean>> {
  return authFetch("/FbiWanted/report-location", { // Asigura-te ca ai endpoint-ul asta in .NET
    method: "POST",
    body: JSON.stringify({ wantedId, lat, lng, details, fileUrl }),
  });
}

export async function uploadFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  try {
    // Atenție: Aici pui portul microserviciului (7005), NU al backend-ului principal
    const response = await fetch(process.env.NEXT_PUBLIC_FILE_API ?? '', {
      method: "POST",
      body: formData,
      headers: {
        "X-Api-Key": process.env.NEXT_PUBLIC_FILE_API_KEY ?? ""
      }
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.url;
  } catch (error) {
    console.error("Eroare la upload:", error);
    throw error;
  }
}

import { ReportPagedResult } from "../types/reports"; // Importa tipurile noi

// ... (restul codului tau existent) ...

// Adaugă această funcție la final:
export async function getReports(
  pageNumber: number = 1, 
  pageSize: number = 10,
  search: string = ""
): Promise<ApiResponse<ReportPagedResult>> {
  
  const params = new URLSearchParams({
    PageNumber: pageNumber.toString(),
    PageSize: pageSize.toString(),
  });

  if (search) {
    params.append("Search", search);
  }

  // Presupunem că endpoint-ul din controller-ul C# este 'Reports' sau 'Reports/feed'
  // Ajustează URL-ul '/Reports' dacă ai pus alt nume la Controller
  return authFetch<ReportPagedResult>(`/FbiWanted/reports?${params.toString()}`);
}