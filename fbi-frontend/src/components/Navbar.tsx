"use client";


import { jwtDecode } from "jwt-decode";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface Roles {
  roles: string[]
}

// Definim ce ne așteptăm să găsim în token
interface CustomJwtPayload {
  realm_access: Roles
}

export const Navbar = () => {
  const pathname = usePathname();
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      try {
        // 1. Decodăm token-ul
        const decoded = jwtDecode<CustomJwtPayload>(token);

        console.log(decoded)
        
        // 2. Extragem rolul (verificăm ambele chei posibile)
        const userRole = decoded.realm_access.roles;

        // 3. Gestionăm cazul în care rolul e string sau array
        // (Dacă userul are mai multe roluri, backend-ul trimite Array)
        if (Array.isArray(userRole)) {
            // Dacă e array, verificăm dacă include ADMIN
            if (userRole.includes("ADMIN")) setRole("ADMIN");
            else setRole("USER");
        } else {
            // Dacă e string simplu
            setRole(userRole || null);
        }

        console.log("👮‍♂️ Rol extras din token:", userRole);

      } catch (error) {
        console.error("Token invalid:", error);
        setRole(null);
      }
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("refresh_token");
    window.location.href = "/login";
  };


  return (
    <nav className="bg-white shadow-md mb-8 rounded-xl px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
      {/* Logo / Titlu */}
      <div className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        🕵️‍♂️ <span className="hidden sm:inline">FBI Most Wanted</span>
      </div>

      {/* Meniu Optiuni */}
      <div className="flex bg-gray-100 p-1 rounded-lg">
        <Link 
          href="/" 
          className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${
            pathname === "/" ? "bg-white text-blue-600 shadow-sm" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Main
        </Link>
        <Link 
          href="/saved" // Vom face pagina asta mai tarziu, momentan duce spre 404 sau gol
          className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${
            pathname === "/saved" ? "bg-white text-blue-600 shadow-sm" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Salvați ❤️
        </Link>
        { role === "ADMIN" &&
        (<Link 
          href="/stats" // Vom face pagina asta mai tarziu, momentan duce spre 404 sau gol
          className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${
            pathname === "/saved" ? "bg-white text-blue-600 shadow-sm" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Stats
        </Link>) } 

        { role === "ADMIN" &&
        (<Link 
          href="/reports" // Vom face pagina asta mai tarziu, momentan duce spre 404 sau gol
          className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${
            pathname === "/reports" ? "bg-white text-blue-600 shadow-sm" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Reports
        </Link>) } 

      </div>

      {/* Logout */}
      <button 
        onClick={handleLogout}
        className="bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-lg hover:bg-red-100 text-sm font-medium transition-colors"
      >
        Logout
      </button>
    </nav>
  );
};