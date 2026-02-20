"use client";

import Link from "next/link";

const navLinks = [
  { href: "#about", label: "About" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#assets", label: "Assets" },
  { href: "#FAQ", label: "FAQ" },
];

export function Nav() {
  return (
    <nav className="fixed top-4 left-1/2 -translate-x-1/2 w-[60%] max-w-7xl z-50">
      <div className="flex items-center justify-between px-8 py-3 rounded-full bg-black/20 backdrop-blur-xl border border-white/10 shadow-2xl">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group cursor-pointer">
          <span className="text-white font-bold tracking-tighter text-lg">StellarStream</span>
        </Link>

        {/* Navigation Links */}
        <ul className="hidden md:flex items-center gap-10">
          {navLinks.map((link) => (
            <li key={link.href} className="relative group">
              <Link
                href={link.href}
                className="text-sm text-gray-300 hover:text-white transition-colors"
              >
                {link.label}
              </Link>
              <span className="absolute -bottom-1 left-0 w-0 h-[2px] bg-cyan-400 transition-all duration-300 group-hover:w-full shadow-[0_0_8px_#22d3ee]" />
            </li>
          ))}
        </ul>

        {/* Start Button */}
        <button className="relative inline-flex items-center justify-center px-6 py-2 overflow-hidden font-medium transition-all bg-white/5 rounded-full border border-white/10 group">
          <span className="absolute w-0 h-0 transition-all duration-500 ease-out bg-cyan-500 rounded-full group-hover:w-56 group-hover:h-56 opacity-10" />
          <span className="relative text-cyan-400 text-sm font-semibold group-hover:text-white transition-colors">
            Start
          </span>
        </button>
      </div>
    </nav>
  );
}
