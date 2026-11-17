export function Disclaimer({ className }: { className?: string }) {
  return (
    <p className={className}>
      Educational project, not affiliated with the FBI. Wanted-person data comes from the public FBI Wanted API.
    </p>
  );
}

export function Footer() {
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto flex max-w-page flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-muted sm:px-8">
        <Disclaimer />
        <p>Map data © OpenStreetMap contributors</p>
      </div>
    </footer>
  );
}
