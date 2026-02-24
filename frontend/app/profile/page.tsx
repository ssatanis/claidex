import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ProfilePage() {
  return (
    <div className="p-8">
      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>View and manage your public profile.</CardDescription>
        </CardHeader>
        <CardContent>
          <p>User profile details will be displayed here.</p>
        </CardContent>
      </Card>
    </div>
  );
}
