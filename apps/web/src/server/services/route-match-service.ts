"use server";

import { requireRole } from "@/server/auth-helpers";
import { Role } from "@/generated/prisma/browser";

export interface RouteGroupCandidate {
  orderId: string;
  orderNumber: string;
  clientName: string;
  city: string;
  state: string;
  pincode: string;
  totalKg: number;
}

export interface RouteGroupSuggestion {
  label: string;
  reason: string;
  orderIds: string[];
  totalKg: number;
}

/**
 * Errors thrown from a Server Action are redacted to a generic message in
 * production. Catching here and returning `{ error }` instead of throwing is
 * what actually gets a readable message back to the toast.
 */
export async function suggestRouteGroups(
  candidates: RouteGroupCandidate[]
): Promise<{ groups: RouteGroupSuggestion[] } | { error: string }> {
  try {
    await requireRole(Role.ADMIN, Role.PLANNER, Role.SALES);

    if (candidates.length === 0) {
      return { groups: [] };
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (openaiApiKey) {
      try {
        const promptText = `You are a logistics dispatcher for an Indian paper mill. Group these pending orders into truck routes — orders whose destinations are in the same city, same pincode area, or naturally along the same road route (nearby pincodes, same district/state) should be grouped together, even if the city name is spelled slightly differently (e.g. "Ludhiana" vs "ludhiana city"). Each order can appear in exactly one group. Small, clearly isolated destinations can be their own single-order group.

ORDERS:
${candidates
  .map(
    (c, i) =>
      `${i + 1}. orderId=${c.orderId} | ${c.orderNumber} | ${c.clientName} | ${c.city}, ${c.state} - ${c.pincode || "no pincode"} | ${c.totalKg} kg`
  )
  .join("\n")}

Respond ONLY with valid JSON of this exact schema:
{
  "groups": [
    { "label": "Short route label e.g. Ludhiana + Jalandhar belt", "reason": "One sentence why these belong on the same truck route", "orderIds": ["..."] }
  ]
}`;

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiApiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o",
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content:
                  "You are a logistics route-planning assistant for an Indian paper mill's truck dispatch. Return ONLY valid JSON with a top-level 'groups' array.",
              },
              { role: "user", content: promptText },
            ],
          }),
        });

        if (response.ok) {
          const json = await response.json();
          const contentText = json.choices?.[0]?.message?.content || "";
          const parsed = JSON.parse(contentText) as { groups: { label: string; reason: string; orderIds: string[] }[] };
          const byId = new Map(candidates.map((c) => [c.orderId, c]));
          const groups: RouteGroupSuggestion[] = (parsed.groups || [])
            .map((g) => {
              const validIds = g.orderIds.filter((id) => byId.has(id));
              return {
                label: g.label,
                reason: g.reason,
                orderIds: validIds,
                totalKg: validIds.reduce((sum, id) => sum + (byId.get(id)?.totalKg || 0), 0),
              };
            })
            .filter((g) => g.orderIds.length > 0);
          if (groups.length > 0) return { groups };
        }
      } catch (err) {
        console.warn("[RouteMatchService] OpenAI API call failed, falling back to pincode clustering:", err);
      }
    }

    return { groups: deterministicRouteGroups(candidates) };
  } catch (err: any) {
    return { error: err?.message || "Failed to suggest route groups." };
  }
}

/**
 * No AI key / API failure fallback: cluster by pincode region (first 3
 * digits — India's postal circle/district grouping), then by normalized
 * city name for orders with no usable pincode.
 */
function deterministicRouteGroups(candidates: RouteGroupCandidate[]): RouteGroupSuggestion[] {
  const normalizeCity = (city: string) => city.trim().toLowerCase().replace(/\s+(city|dist\.?|district)$/i, "");

  const keyFor = (c: RouteGroupCandidate) => {
    const pin = (c.pincode || "").replace(/\D/g, "");
    if (pin.length >= 3) return `PIN-${pin.slice(0, 3)}`;
    return `CITY-${normalizeCity(c.city)}-${c.state.trim().toLowerCase()}`;
  };

  const groupsMap = new Map<string, RouteGroupCandidate[]>();
  for (const c of candidates) {
    const key = keyFor(c);
    if (!groupsMap.has(key)) groupsMap.set(key, []);
    groupsMap.get(key)!.push(c);
  }

  return Array.from(groupsMap.entries()).map(([key, rows]) => {
    const cities = Array.from(new Set(rows.map((r) => r.city)));
    const label = cities.slice(0, 3).join(" + ") + (cities.length > 3 ? ` + ${cities.length - 3} more` : "");
    const reason = key.startsWith("PIN-")
      ? `Same postal region (pincode prefix ${key.replace("PIN-", "")}).`
      : `Same city/state — no pincode on file to narrow further.`;
    return {
      label,
      reason,
      orderIds: rows.map((r) => r.orderId),
      totalKg: rows.reduce((sum, r) => sum + r.totalKg, 0),
    };
  });
}
