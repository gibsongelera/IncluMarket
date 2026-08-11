import { requireRole } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { AdminThemeClient } from "@/components/AdminThemeClient";
import { getThemePresets, getThemePreset } from "@/lib/theme";
import { getThemeSettings } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AdminThemePage() {
  const session = await requireRole(["admin"]);
  const settings = await getThemeSettings();
  const presetId = settings?.theme_preset || "default";
  const preset = getThemePreset(presetId);

  const initial = {
    presetId,
    nav: (settings?.color_nav || preset.vars["--color-nav"]).toUpperCase(),
    body: (settings?.color_body || preset.vars["--color-body"]).toUpperCase(),
    footer: (settings?.color_footer || preset.vars["--color-footer"]).toUpperCase(),
    hasOverrides: !!(settings?.color_nav || settings?.color_body || settings?.color_footer),
  };

  const presets = getThemePresets().map((p) => ({
    id: p.id,
    label: p.label,
    description: p.description,
    swatches: p.swatches,
  }));

  return (
    <>
      <SiteHeader variant="admin" active="theme" session={session} />
      <main id="main" className="container main--admin">
        <div className="page-head">
          <h1>Theme &amp; appearance</h1>
          <p className="lede muted" style={{ color: "var(--canvas-white)" }}>
            Customize nav, body, and footer colors. Presets sync live across buyer, seller, and admin
            pages.
          </p>
        </div>
        <AdminThemeClient initial={initial} presets={presets} />
      </main>
      <SiteFooter />
    </>
  );
}
