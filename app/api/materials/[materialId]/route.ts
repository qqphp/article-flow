import { NextResponse } from "next/server";
import { deleteMaterial } from "../../../lib/material-store";

export async function DELETE(_: Request, { params }: { params: { materialId: string } }) {
  try {
    const deleted = await deleteMaterial(params.materialId);
    return deleted
      ? NextResponse.json({ deleted: true })
      : NextResponse.json({ error: "素材不存在" }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "删除素材失败" }, { status: 500 });
  }
}
