import type { Metadata } from "next";
import Image from "next/image";

import { SiteFooter } from "@/components/shell/site-footer";
import { SiteHeader } from "@/components/shell/site-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";

export const metadata: Metadata = {
  description:
    "A verified network for students and graduates of International Islamic University Chittagong: find people by skill, book a 30-minute mentorship session, see jobs.",
};

const steps = [
  {
    title: "Prove you belong",
    body: "Sign up, confirm your email and submit your IIUC student or graduate record. An admin reviews it before you appear in the directory.",
  },
  {
    title: "Find the right person",
    body: "Search by name, skill, company or department. Results are ranked best match first, and a small typo still finds them.",
  },
  {
    title: "Book 30 minutes",
    body: "Pick a free slot from an alumnus, send a short request, and get a meeting link when they accept.",
  },
] as const;

const also = [
  {
    title: "A jobs board",
    body: "Alumni post openings. Members apply with a message and an optional CV, and the poster shortlists or replies.",
  },
  {
    title: "Notifications",
    body: "You are told when a request is answered, a session is confirmed or an application changes.",
  },
  {
    title: "Privacy you control",
    body: "Choose who sees your profile: everyone, the IIUC community, or only you. Contact details stay private.",
  },
] as const;

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col bg-background">
      <section className="relative isolate flex min-h-[90svh] flex-col overflow-hidden bg-navy">
        <Image
          src="/brand/campus-aerial.webp"
          alt="An aerial view of the IIUC campus: green lawns, a mosque and academic buildings among trees."
          fill
          priority
          sizes="100vw"
          className="-z-10 object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-linear-to-t from-navy/95 via-navy/60 to-navy/40" />
        <SiteHeader />
        <div className="mx-auto flex w-full max-w-6xl flex-1 items-end px-4 pt-32 pb-14 sm:px-6 sm:pb-20">
          <div className="max-w-3xl">
            <h1 className="text-5xl leading-[1.05] font-extrabold text-white sm:text-6xl">
              Find your IIUC network. Get a mentor in 30 minutes.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-white/90 sm:text-xl">
              A verified network for students and graduates of International Islamic University
              Chittagong.
            </p>
            <form
              action="/directory"
              method="get"
              role="search"
              className="mt-8 flex max-w-2xl flex-col gap-2 rounded-2xl bg-background p-2 shadow-lift sm:flex-row"
            >
              <label htmlFor="home-q" className="sr-only">
                Search members
              </label>
              <div className="relative flex-1">
                <Icon
                  name="search"
                  className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted"
                />
                <input
                  id="home-q"
                  name="q"
                  type="search"
                  maxLength={200}
                  autoComplete="off"
                  placeholder="Search people, skills or companies"
                  className="field border-transparent pl-12"
                />
              </div>
              <button type="submit" className="button button-primary button-lg">
                Search
              </button>
            </form>
            <p className="mt-3 text-sm text-white/85">
              The directory is for members, so you will be asked to sign in first.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <LinkButton
                href="/sign-up"
                variant="quiet"
                size="lg"
                icon="arrow-right"
                className="border-transparent bg-white text-navy hover:bg-white/90"
              >
                Create an account
              </LinkButton>
            </div>
          </div>
        </div>
      </section>

      <main>
        <section aria-labelledby="how-heading" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <h2 id="how-heading" className="max-w-2xl text-3xl font-extrabold sm:text-4xl">
            How it works
          </h2>
          <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-12">
            {steps.map((step, i) => (
              <li key={step.title} className="border-t border-border pt-6">
                <span className="text-5xl font-extrabold text-accent tabular-nums" aria-hidden="true">
                  {i + 1}
                </span>
                <h3 className="mt-4 text-xl font-bold">{step.title}</h3>
                <p className="mt-2 text-lg text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="bg-surface py-20 sm:py-28">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-24 px-4 sm:px-6">
            <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <div>
                <h2 className="text-3xl font-extrabold sm:text-4xl">A directory you can trust</h2>
                <p className="mt-4 max-w-lg text-lg text-muted">
                  Every member has been checked against IIUC records. Search puts the best match first
                  and forgives small typos, so a misspelt skill still finds the people who have it.
                </p>
              </div>
              <div aria-hidden="true" className="flex flex-col gap-3">
                <p className="text-sm font-semibold text-muted">Example search</p>
                <div className="flex min-h-12 items-center gap-3 rounded-xl border border-[var(--field-border)] bg-background px-4">
                  <Icon name="search" className="text-muted" />
                  <span>pythn</span>
                </div>
                {[
                  ["Rahim Chowdhury", "Software engineer", "Alumni"],
                  ["Nusrat Jahan", "Data analyst", "Alumni"],
                ].map(([name, role, who]) => (
                  <Card key={name} className="flex items-center gap-4">
                    <Avatar id={name ?? ""} name={name ?? ""} size={56} />
                    <div className="min-w-0">
                      <p className="font-bold">{name}</p>
                      <p className="text-sm text-muted">{role}</p>
                      <div className="mt-2 flex gap-2">
                        <Badge tone="accent">{who}</Badge>
                        <Badge tone="brand" icon="shield-check">Verified</Badge>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <div aria-hidden="true" className="order-2 flex flex-col gap-3 lg:order-1">
                <p className="text-sm font-semibold text-muted">Example request</p>
                <Card className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <Avatar id="Sara Lee" name="Sara Lee" size={40} />
                    <p className="font-bold">Sara Lee, mentor</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {["Tue 8:00 pm", "Wed 9:30 pm", "Fri 7:00 pm"].map((slot, i) => (
                      <span
                        key={slot}
                        className={
                          i === 1
                            ? "inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-on-brand"
                            : "inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold"
                        }
                      >
                        <Icon name="clock" className="size-4" />
                        {slot}
                      </span>
                    ))}
                  </div>
                  <div className="flex min-h-12 items-center rounded-xl bg-brand px-5 font-semibold text-on-brand">
                    Request this session
                  </div>
                </Card>
              </div>
              <div className="order-1 lg:order-2">
                <h2 className="text-3xl font-extrabold sm:text-4xl">Mentorship that fits a busy week</h2>
                <p className="mt-4 max-w-lg text-lg text-muted">
                  Alumni publish the times they are free. You choose a slot and add a short note. They
                  accept with a meeting link, and after the session each side leaves feedback.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="also-heading" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <h2 id="also-heading" className="max-w-2xl text-3xl font-extrabold sm:text-4xl">
            And the rest of what a network needs
          </h2>
          <ul className="mt-12 grid gap-10 md:grid-cols-3 md:gap-12">
            {also.map((item) => (
              <li key={item.title}>
                <h3 className="text-xl font-bold">{item.title}</h3>
                <p className="mt-2 text-lg text-muted">{item.body}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
