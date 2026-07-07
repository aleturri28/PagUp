export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  StudentHome: undefined;
  PaymentWizard: undefined;
  Training: undefined;
  TutorDashboard: undefined;
  TutorSettings: { requirePinSetup?: boolean } | undefined;
  Settings: { unlocked?: boolean } | undefined;
};
