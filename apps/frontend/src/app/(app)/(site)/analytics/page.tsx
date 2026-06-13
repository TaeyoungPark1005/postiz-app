export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { WorkspaceAnalytics } from '@gitroom/frontend/components/workspace-analytics/workspace.analytics';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';
export const metadata: Metadata = {
  title: `${isGeneralServerSide() ? 'Postiz' : 'Gitroom'} Analytics`,
  description: '',
};
export default async function Index() {
  return <WorkspaceAnalytics />;
}
