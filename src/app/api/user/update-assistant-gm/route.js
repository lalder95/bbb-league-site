import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import clientPromise from "@/lib/mongodb";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const { teamState, assetPriority, strategyNotes } = await req.json();
    const client = await clientPromise;
    const db = client.db("bbb-league");
    const users = db.collection("users");
    const result = await users.updateOne(
      { id: session.user.id },
      { $set: { teamState, assetPriority, strategyNotes } }
    );
    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Assistant GM API error:", err); // Add this for debugging
    return NextResponse.json({ error: err.message || "Unknown error" }, { status: 500 });
  }
}