import QuestionnaireForm from "./QuestionnaireForm";

export default async function QuestionnairePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <QuestionnaireForm token={token} />;
}
