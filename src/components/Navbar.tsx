import React from "react";
import Link from "next/link";
import Image from "next/image";

export default function Navbar() {
  return (
    <nav className="bg-[#1e4b8f] text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-4 hover:opacity-90 transition-opacity">
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center p-1">
              <Image
                src="/logo_Politeknik-Elektronika-Negeri-Surabaya-thumb.webp"
                alt="PENS Logo"
                width={40}
                height={40}
                className="h-full w-full object-contain"
              />
            </div>
            <span className="font-bold text-lg tracking-wide hidden sm:block">
              ETHOL ATTENDANCE
            </span>
          </Link>
          <div className="flex gap-4">
            <Link href="/" className="text-sm font-semibold hover:text-yellow-400 transition-colors">
              Scanner
            </Link>
            <Link href="/register" className="text-sm font-semibold hover:text-yellow-400 transition-colors">
              Register
            </Link>
            <Link href="/admin" className="text-sm font-semibold hover:text-yellow-400 transition-colors">
              Admin
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
