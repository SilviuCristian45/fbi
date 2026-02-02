"use client";

import { jwtDecode } from "jwt-decode";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Roles {
  roles: string[]
}

interface CustomJwtPayload {
  realm_access: Roles
}

export const Navbar = () => {
  const pathname = usePathname();
  const router = useRouter(); // Folosim router pentru redirect mai clean
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    // Verificăm token-ul doar pe client
    if (typeof window !== "undefined") {
        const token = localStorage.getItem("token");
        if (token) {
        try {
            const decoded = jwtDecode<CustomJwtPayload>(token);
            // Verificăm structura realm_access (uneori poate lipsi)
            const userRole = decoded.realm_access?.roles || [];

            if (Array.isArray(userRole)) {
                if (userRole.includes("ADMIN")) setRole("ADMIN");
                else setRole("USER");
            } else {
                setRole(userRole || null);
            }
        } catch (error) {
            console.error("Token invalid:", error);
            setRole(null);
        }
        }
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("refresh_token");
    router.push("/auth/login"); // Redirect folosind Next Router
  };

  // Helper pentru clasele link-urilor
  const getLinkClass = (path: string) => {
    const isActive = pathname === path;
    return `px-4 sm:px-6 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
      isActive
        ? "bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400"
        : "text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700/50"
    }`;
  };

  return (
    <nav className="bg-white dark:bg-gray-900 shadow-md mb-8 rounded-xl px-4 sm:px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4 border-b border-gray-100 dark:border-gray-800 transition-colors duration-200">
      
      {/* Logo / Titlu */}
      <div className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
        <span className="text-3xl">🕵️‍♂️</span> 
        <span className="hidden sm:inline">FBI Most Wanted</span>
      </div>

      {/* Meniu Optiuni */}
      <div className="flex flex-wrap justify-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg transition-colors">
        <Link href="/" className={getLinkClass("/")}>
          Main
        </Link>
        
        <Link href="/saved" className={getLinkClass("/saved")}>
          Saved ❤️
        </Link>

        {role === "ADMIN" && (
          <Link href="/stats" className={getLinkClass("/stats")}>
            Stats 📊
          </Link>
        )}

{/* 👇 LINK NOU AICI */}
        <Link href="/my-location" className={getLinkClass("/my-location")}>
          Locația Mea 📍
        </Link>
        
        {role === "ADMIN" && (
          <Link href="/reports" className={getLinkClass("/reports")}>
            Reports 📝
          </Link>
        )}
      </div>

      {/* Logout */}
      <button 
        onClick={handleLogout}
        className="bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                   hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/50 dark:hover:bg-red-900/40"
      >
        Logout
      </button>
    </nav>
  );
};