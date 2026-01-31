"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithGeneric } from "@/src/lib/api-client";
import { AuthTokenData } from "@/src/types/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const result = await fetchWithGeneric<AuthTokenData>("/Auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: email, password }),
      });

      if (result.type === "Success") {
        localStorage.setItem("token", result.data.access_token);
        localStorage.setItem("refresh_token", result.data.refresh_token);
        console.log("Login reușit! Token salvat.");
        router.push("/");
      } else {
        setError(result.message.join(", "));
      }
    } catch (err: any) {
      setError(err.message || "Login failed");
    }
  };

  return (
    // 1. Fundalul paginii: gri deschis pe light, gri foarte închis pe dark
    <div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-gray-900 transition-colors duration-200">
      
      {/* 2. Cardul: alb pe light, gri închis pe dark */}
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md dark:bg-gray-800 dark:border dark:border-gray-700">
        
        {/* 3. Titlul: negru pe light, alb pe dark */}
        <h2 className="mb-6 text-center text-2xl font-bold text-gray-900 dark:text-white">
          Login
        </h2>
        
        {error && (
          <div className="mb-4 rounded bg-red-100 p-3 text-sm text-red-700 dark:bg-red-900 dark:text-red-100">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            {/* 4. Label-urile: gri pe light, gri deschis pe dark */}
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Email / Username
            </label>
            <input
              type="text"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              // 5. Input-urile: fundal alb/border gri pe light -> fundal gri/border gri pe dark
              // IMPORTANT: text-gray-900 dark:text-white asigură că textul scris e vizibil
              className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm 
                         focus:border-blue-500 focus:ring-blue-500 
                         text-gray-900 bg-white 
                         dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm 
                         focus:border-blue-500 focus:ring-blue-500 
                         text-gray-900 bg-white 
                         dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 transition-colors dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}