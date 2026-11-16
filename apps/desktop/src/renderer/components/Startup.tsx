// The startup view (Q339): while the first data loads, the icon and the name in
// the window's color rather than an empty frame. It fades in after a moment, so
// that a quick start shows nothing but the window's background.
import { APP_ICON } from "../lib/icon";
import { t } from "../lib/strings";

export function Startup() {
  return (
    <div
      className="drag-region flex h-screen flex-col items-center justify-center gap-3 bg-background animate-in fade-in-0 duration-500"
      style={{ animationDelay: "200ms", animationFillMode: "backwards" }}
      data-testid="startup"
    >
      <img src={APP_ICON} alt="" className="size-20" draggable={false} />
      <span className="text-sm font-medium text-muted-foreground">{t.app.name}</span>
    </div>
  );
}
