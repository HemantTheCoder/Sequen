import { ImportView } from "./import-view";

export default async function ImportPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <ImportView projectId={projectId} />;
}
