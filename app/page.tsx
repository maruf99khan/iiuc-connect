const pillars = [
  {
    title: "Verified members",
    body: "Every student and alumnus is checked against IIUC records before joining the community.",
  },
  {
    title: "Find the right person",
    body: "Search alumni by name, skill, department, batch and city.",
  },
  {
    title: "Flash mentorship",
    body: "Book a focused 15 to 30 minute session with an alumnus in your field.",
  },
] as const;

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-5 py-12 sm:py-20">
      <header className="flex flex-col gap-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">
          International Islamic University Chittagong
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          IIUC Connect
        </h1>
        <p className="max-w-xl text-lg leading-8 text-muted">
          A verified alumni and professional network for IIUC students and
          graduates.
        </p>
      </header>

      <section aria-labelledby="pillars-heading" className="flex flex-col gap-4">
        <h2 id="pillars-heading" className="text-xl font-semibold">
          What it will offer
        </h2>
        <ul className="grid gap-4 sm:grid-cols-3">
          {pillars.map((pillar) => (
            <li
              key={pillar.title}
              className="rounded-xl border border-border bg-surface p-5"
            >
              <h3 className="font-semibold">{pillar.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{pillar.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <p
        role="status"
        className="rounded-xl border border-border bg-surface px-5 py-4 text-sm text-muted"
      >
        This platform is under development as a CSE undergraduate thesis
        project. Sign-in is not open yet.
      </p>
    </main>
  );
}
