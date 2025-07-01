import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import clientPromise from "@/lib/mongodb";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const client = await clientPromise;
    const db = client.db("bbb-league");
    const users = db.collection("users");
    const user = await users.findOne({ id: session.user.id });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    // Only return the relevant fields
    return NextResponse.json({
      teamState: user.teamState ?? "Compete",
      assetPriority: user.assetPriority ?? ["QB", "RB", "WR", "TE", "Picks"],
      strategyNotes: user.strategyNotes ?? "",
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Unknown error" }, { status: 500 });
  }
}