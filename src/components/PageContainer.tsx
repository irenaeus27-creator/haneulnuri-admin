import TopAlertBell from "@/components/TopAlertBell";

type PageContainerProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
};

export default function PageContainer({
  title,
  description,
  children,
}: PageContainerProps) {
  return (
    <main className="flex-1 bg-slate-100 p-8 overflow-x-auto">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900">{title}</h1>

          {description && (
            <p className="mt-2 text-sm font-medium text-slate-500">
              {description}
            </p>
          )}
        </div>

        <TopAlertBell />
      </div>

      {children}
    </main>
  );
}