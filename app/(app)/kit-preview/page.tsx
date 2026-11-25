import { Alert, EmptyState, Skeleton } from "@/components/ui/feedback";
import { Avatar } from "@/components/ui/avatar";
import { Badge, Chip } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";
import { Pagination, Segmented } from "@/components/ui/nav";
import { PageHeader } from "@/components/ui/page-header";

// THROWAWAY review page for Phase 0 (plan Task 4). Deleted at Task 7; never ships.
export default function KitPreview() {
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="Component preview"
        description="Every shared piece in one place, in both themes."
        actions={<LinkButton href="/directory" icon="arrow-right">Primary action</LinkButton>}
      />

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">Buttons</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="quiet">Quiet</Button>
          <Button variant="ghost">Ghost</Button>
          <Button disabled>Disabled</Button>
          <Button size="lg" icon="arrow-right">Large</Button>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">Badges, chips, avatars</h2>
        <div className="flex flex-wrap gap-2">
          <Badge>Neutral</Badge>
          <Badge tone="brand" icon="shield-check">Verified</Badge>
          <Badge tone="accent">Alumni</Badge>
          <Badge tone="ink">Student</Badge>
          <Badge tone="warn">Pending</Badge>
          <Badge tone="danger">Rejected</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip>Python</Chip>
          <Chip>Network engineering</Chip>
          <Chip>PostgreSQL</Chip>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {["f1", "a2", "k3", "z4", "q5", "m6"].map((id, i) => (
            <Avatar key={id} id={id} name={["Rahim Chowdhury", "Nusrat Jahan", "Karim", "Sara Lee", "Tom Roy", "মারুফ খান"][i] ?? id} size={56} />
          ))}
          <Avatar id="x" name="Dana Python" size={96} />
          <Avatar id="y" name="Vera Viewer" size={40} />
          <Avatar id="w" name="Una Python" size={32} />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">Cards</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <h3 className="font-bold">A plain card</h3>
            <p className="mt-1 text-muted">Hairline border, no shadow at rest.</p>
          </Card>
          <Card interactive>
            <div className="flex items-center gap-3">
              <Avatar id="card1" name="Rahim Chowdhury" />
              <div className="min-w-0">
                <h3 className="font-bold">
                  <a href="/directory" className="text-foreground no-underline after:absolute after:inset-0 hover:no-underline">
                    Rahim Chowdhury
                  </a>
                </h3>
                <p className="truncate text-sm text-muted">Network engineer at Grameenphone</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone="accent">Alumni</Badge>
              <Badge>CSE · 2019</Badge>
            </div>
          </Card>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">Messages</h2>
        <Alert tone="info" title="Heads up">A neutral note about the page.</Alert>
        <Alert tone="success" title="Saved">Your changes are live.</Alert>
        <Alert tone="warn" title="Check this">Your claim is waiting for review.</Alert>
        <Alert tone="danger" title="Could not send">Try again in a moment.</Alert>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">Filters, paging, forms</h2>
        <Segmented
          label="Show"
          options={[
            { label: "All", href: "#", active: true },
            { label: "Alumni", href: "#", active: false },
            { label: "Students", href: "#", active: false },
          ]}
        />
        <div className="max-w-sm">
          <label htmlFor="kit-email" className="mb-1 block text-sm font-semibold">Email</label>
          <input id="kit-email" className="field" type="email" placeholder="you@example.com" />
        </div>
        <Pagination page={2} pageCount={5} hrefFor={(n) => `#${n}`} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">Empty and loading</h2>
        <EmptyState
          icon="users"
          title="No members match that"
          description="Try fewer words or check the spelling. Small typos are forgiven."
          action={<LinkButton href="#" variant="quiet">Clear search</LinkButton>}
        />
        <Card className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </Card>
        <p className="flex items-center gap-2 text-sm text-muted">
          <Icon name="clock" /> Icons use currentColor.
        </p>
      </section>
    </div>
  );
}
