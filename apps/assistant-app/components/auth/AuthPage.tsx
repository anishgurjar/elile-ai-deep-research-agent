"use client";

import { SignInButton } from "@clerk/nextjs";
import Image from "next/image";

export function AuthPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto mb-6 flex justify-center">
            <Image
              src="/assets/elileai-logo.png"
              alt="Elile AI"
              width={80}
              height={56}
              className="object-contain"
              priority
            />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Elile AI</h1>
          <p className="mt-1 text-base font-medium text-gray-600">Deep Research Assistant</p>
        </div>

        <div className="mt-8 space-y-6">
          <div className="bg-white py-8 px-6 shadow-lg rounded-lg border border-gray-200">
            <div className="space-y-4">
              <SignInButton mode="modal">
                <button className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-[#2738f2] hover:bg-[#1c28c7] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#2738f2] transition-colors">
                  Sign in to your account
                </button>
              </SignInButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
