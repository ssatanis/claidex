import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface KpiCardProps {
	title: string;
	value: string | number | null;
	subtitle?: string;
	icon?: React.ReactNode;
	loading?: boolean;
	error?: boolean;
	onRetry?: () => void;
}

export function KpiCard({ title, value, subtitle, icon, loading, error, onRetry }: KpiCardProps) {
	return (
		<Card className="h-full">
			<CardHeader className="pb-2">
				<CardTitle className="text-sm font-medium flex items-center gap-2">
					{icon}
					{title}
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-1">
				{loading ? (
					<Skeleton className="h-8 w-24" />
				) : error ? (
					<>
						<div className="text-2xl font-bold text-gray-400 leading-tight">—</div>
						<div className="text-xs text-gray-500 leading-snug">
							Data unavailable
							{onRetry && (
								<>
									{" · "}
									<button
										type="button"
										onClick={onRetry}
										className="text-black font-medium hover:underline focus:outline-none focus:ring-2 focus:ring-[#6ABF36] focus:ring-offset-1 rounded"
										aria-label="Retry loading"
									>
										Retry
									</button>
								</>
							)}
						</div>
					</>
				) : (
					<>
						<div className="text-2xl font-bold text-black leading-tight">{value ?? "—"}</div>
						{subtitle && <div className="text-xs text-gray-500 leading-snug">{subtitle}</div>}
					</>
				)}
			</CardContent>
		</Card>
	);
}
