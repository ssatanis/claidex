import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white">
      <div className="text-center">
        <h1 className="text-9xl font-extrabold text-gray-900 tracking-tight">404</h1>
        <p className="mt-4 text-xl text-gray-600">Oops! The page you're looking for isn't here.</p>
        <p className="mt-2 text-md text-gray-500">You might have typed the address incorrectly, or the page may have moved.</p>
        <div className="mt-6">
          <Button asChild>
            <Link href="/">Go back home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
