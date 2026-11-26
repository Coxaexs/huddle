import { currentUser, unauthorized } from "@/lib/auth";
import {
  closeTicket,
  createAndPublishTicketPanel,
  deleteTicketPanel,
  listTicketPanels,
  listTickets,
} from "@/lib/community-bot/ticketing";
import { can, Permission } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage unavailable." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const { id: serverId } = await context.params;
  if (!(await can(db, user.id, serverId, Permission.MANAGE_SERVER))) {
    return Response.json({ error: "Manage Server permission is required." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: "create-panel" | "close-ticket";
    ticketId?: string;
    channelId?: string;
    title?: string;
    description?: string;
    buttonLabel?: string;
    buttonEmoji?: string;
    color?: string;
    welcomeMessage?: string;
    supportRoleId?: string | null;
  };

  if (body.action === "close-ticket" && body.ticketId) {
    const res = await closeTicket(db, serverId, body.ticketId, user.id);
    if (!res.ok) return Response.json({ error: res.notice }, { status: 400 });
    const tickets = await listTickets(db, serverId);
    return Response.json({ ok: true, tickets });
  }

  if (!body.channelId) {
    return Response.json({ error: "Choose a channel for the ticket panel." }, { status: 400 });
  }

  const res = await createAndPublishTicketPanel(db, serverId, {
    channelId: body.channelId,
    title: body.title || "Need Support?",
    description: body.description || "Click below to open a support ticket.",
    buttonLabel: body.buttonLabel,
    buttonEmoji: body.buttonEmoji,
    color: body.color,
    welcomeMessage: body.welcomeMessage,
    supportRoleId: body.supportRoleId,
  });
  if ("error" in res) return Response.json({ error: res.error }, { status: 400 });

  const [ticketPanels, tickets] = await Promise.all([
    listTicketPanels(db, serverId),
    listTickets(db, serverId),
  ]);
  return Response.json({ ok: true, panel: res, ticketPanels, tickets });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage unavailable." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const { id: serverId } = await context.params;
  if (!(await can(db, user.id, serverId, Permission.MANAGE_SERVER))) {
    return Response.json({ error: "Manage Server permission is required." }, { status: 403 });
  }

  const panelId = new URL(request.url).searchParams.get("panelId") || "";
  if (!panelId) return Response.json({ error: "Missing panelId." }, { status: 400 });

  await deleteTicketPanel(db, serverId, panelId);
  const ticketPanels = await listTicketPanels(db, serverId);
  return Response.json({ ok: true, ticketPanels });
}
