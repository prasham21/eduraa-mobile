import React from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { AnimatedButton, AnimatedCard, AppScreen, BottomTabBar, GradientHeroCard } from '../components/ui'
import { useAuthStore } from '../stores/authStore'
import { colors } from '../theme/colors'
import { fonts } from '../theme/fonts'
import { spacing } from '../theme/spacing'
import type { AccountMinimal } from '../types'
import { resolveMobileLanding } from '../auth/landing'

import LoginScreen from '../screens/auth/LoginScreen'
import RegisterScreen from '../screens/auth/RegisterScreen'
import RegisterIndividualScreen from '../screens/auth/RegisterIndividualScreen'
import RegisterSchoolScreen from '../screens/auth/RegisterSchoolScreen'
import VerifyEmailScreen from '../screens/auth/VerifyEmailScreen'
import HomeScreen from '../screens/home/HomeScreen'
import PapersScreen from '../screens/papers/PapersScreen'
import GeneratePaperScreen from '../screens/papers/GeneratePaperScreen'
import PaperDetailScreen from '../screens/papers/PaperDetailScreen'
import AttemptPaperScreen from '../screens/papers/AttemptPaperScreen'
import QuizScreen from '../screens/papers/QuizScreen'
import ResultsScreen from '../screens/results/ResultsScreen'
import ResultDetailScreen from '../screens/results/ResultDetailScreen'
import LearningHomeScreen from '../screens/learning/LearningHomeScreen'
import CompetitiveExamScreen from '../screens/learning/CompetitiveExamScreen'
import CompetitiveSubjectScreen from '../screens/learning/CompetitiveSubjectScreen'
import CompetitiveChapterScreen from '../screens/learning/CompetitiveChapterScreen'
import AgenticLearningScreen from '../screens/learning/AgenticLearningScreen'
import AgenticSubjectScreen from '../screens/learning/AgenticSubjectScreen'
import AgenticTopicScreen from '../screens/learning/AgenticTopicScreen'
import PreviousPapersScreen from '../screens/learning/PreviousPapersScreen'
import WorkspaceScreen from '../screens/workspace/WorkspaceScreen'
import FeatureScreen from '../screens/workspace/FeatureScreen'
import ApprovalsScreen from '../screens/workspace/ApprovalsScreen'
import AttendanceScreen from '../screens/workspace/AttendanceScreen'
import ScanUploadScreen from '../screens/workspace/ScanUploadScreen'
import ExamsScreen from '../screens/workspace/ExamsScreen'
import ClassTeacherOverviewScreen from '../screens/classTeacher/ClassTeacherOverviewScreen'
import ClassRosterScreen from '../screens/classTeacher/ClassRosterScreen'
import ClassSubjectsScreen from '../screens/classTeacher/ClassSubjectsScreen'
import SubjectEnrollmentScreen from '../screens/classTeacher/SubjectEnrollmentScreen'
import ClassValidationScreen from '../screens/classTeacher/ClassValidationScreen'
import AIStudioScreen from '../screens/studio/AIStudioScreen'
import ProfileScreen from '../screens/profile/ProfileScreen'

export type AuthStackParamList = {
  Login: undefined
  Register: undefined
  RegisterIndividual: undefined
  RegisterSchool: undefined
  VerifyEmail: { email: string; devOtp?: string; message?: string; deliveryChannel?: string }
}

export type PapersStackParamList = {
  PapersList: undefined
  GeneratePaper: undefined
  PaperDetail: { paperId: string }
  AttemptPaper: { paperId: string; examId?: string }
  Quiz: { paperId: string }
}

export type ResultsStackParamList = {
  ResultsList: undefined
  ResultDetail: { submissionId?: string; checkedPaperId?: string }
}

export type LearningStackParamList = {
  LearningHome: undefined
  CompetitiveExam: undefined
  CompetitiveSubject: { subjectName: string }
  CompetitiveChapter: { subjectName: string; chapterKey: string }
  AgenticLearning: undefined
  AgenticSubject: { subjectId: string; subjectName: string }
  AgenticTopic: { topicId: string }
  PreviousPapers: undefined
  Feature: { featureId: string }
  Approvals: undefined
  Attendance: undefined
  ScanUpload: undefined
  Exams: undefined
  AIStudio: undefined
}

export type StaffWorkspaceStackParamList = {
  StaffWorkspace: undefined
  Feature: { featureId: string }
  Approvals: undefined
  Attendance: undefined
  ScanUpload: undefined
  Exams: undefined
  StaffAIStudio: undefined
  StaffGeneratePaper: undefined
  StaffPapers: undefined
  StaffResults: undefined
  ResultDetail: { submissionId?: string; checkedPaperId?: string }
  ClassTeacherOverview: undefined
  ClassRoster: undefined
  ClassSubjects: undefined
  SubjectEnrollment: { subjectId: string; subjectName: string }
  ClassValidation: undefined
}

export type ProfileStackParamList = {
  ProfileMain: undefined
}

export type TabParamList = {
  Home: undefined
  Learning: undefined
  Papers: undefined
  Results: undefined
  Profile: undefined
}

export type StaffTabParamList = {
  StaffHome: undefined
  StaffApprovals: undefined
  StaffAttendance: undefined
  StaffScanUpload: undefined
  StaffExams: undefined
  StaffPapers: undefined
  StaffResults: undefined
  StaffAIStudio: undefined
}

const AuthStack = createNativeStackNavigator<AuthStackParamList>()
const PapersStack = createNativeStackNavigator<PapersStackParamList>()
const ResultsStack = createNativeStackNavigator<ResultsStackParamList>()
const LearningStack = createNativeStackNavigator<LearningStackParamList>()
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>()
const StaffWorkspaceStack = createNativeStackNavigator<StaffWorkspaceStackParamList>()
const Tab = createBottomTabNavigator<TabParamList>()
const StaffTab = createBottomTabNavigator<StaffTabParamList>()
const OnboardingStack = createNativeStackNavigator<{ B2COnboarding: undefined }>()

const stackScreenOptions = {
  headerStyle: {
    backgroundColor: colors.backgroundElevated,
  },
  headerTintColor: colors.text,
  headerTitleStyle: {
    fontFamily: fonts.displaySemibold,
    fontSize: 17,
    color: colors.text,
  },
  headerShadowVisible: false,
  contentStyle: {
    backgroundColor: colors.background,
  },
}

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
      <AuthStack.Screen name="RegisterIndividual" component={RegisterIndividualScreen} />
      <AuthStack.Screen name="RegisterSchool" component={RegisterSchoolScreen} />
      <AuthStack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
    </AuthStack.Navigator>
  )
}

function PapersNavigator() {
  return (
    <PapersStack.Navigator screenOptions={stackScreenOptions}>
      <PapersStack.Screen name="PapersList" component={PapersScreen} options={{ title: 'Papers' }} />
      <PapersStack.Screen name="GeneratePaper" component={GeneratePaperScreen} options={{ title: 'Generate paper' }} />
      <PapersStack.Screen name="PaperDetail" component={PaperDetailScreen} options={{ title: 'Paper detail' }} />
      <PapersStack.Screen name="AttemptPaper" component={AttemptPaperScreen} options={{ headerShown: false }} />
      <PapersStack.Screen name="Quiz" component={QuizScreen} options={{ headerShown: false }} />
    </PapersStack.Navigator>
  )
}

function ResultsNavigator() {
  return (
    <ResultsStack.Navigator screenOptions={stackScreenOptions}>
      <ResultsStack.Screen name="ResultsList" component={ResultsScreen} options={{ title: 'Results' }} />
      <ResultsStack.Screen name="ResultDetail" component={ResultDetailScreen} options={{ title: 'Result detail' }} />
    </ResultsStack.Navigator>
  )
}

function LearningNavigator({ competitive = false }: { competitive?: boolean }) {
  return (
    <LearningStack.Navigator initialRouteName={competitive ? 'CompetitiveExam' : 'LearningHome'} screenOptions={stackScreenOptions}>
      <LearningStack.Screen name="LearningHome" component={LearningHomeScreen} options={{ title: 'Learning' }} />
      <LearningStack.Screen name="CompetitiveExam" component={CompetitiveExamScreen} options={{ title: 'JEE resources' }} />
      <LearningStack.Screen name="CompetitiveSubject" component={CompetitiveSubjectScreen} options={{ title: 'Competitive subject' }} />
      <LearningStack.Screen name="CompetitiveChapter" component={CompetitiveChapterScreen} options={{ title: 'Chapter workspace' }} />
      <LearningStack.Screen name="AgenticLearning" component={AgenticLearningScreen} options={{ title: 'Agentic Learning' }} />
      <LearningStack.Screen name="AgenticSubject" component={AgenticSubjectScreen} options={{ title: 'Concept buckets' }} />
      <LearningStack.Screen name="AgenticTopic" component={AgenticTopicScreen} options={{ title: 'Concept lesson' }} />
      <LearningStack.Screen name="PreviousPapers" component={PreviousPapersScreen} options={{ title: 'Previous papers' }} />
      <LearningStack.Screen name="Feature" component={FeatureScreen} options={{ title: 'Feature' }} />
      <LearningStack.Screen name="Approvals" component={ApprovalsScreen} options={{ title: 'Approvals' }} />
      <LearningStack.Screen name="Attendance" component={AttendanceScreen} options={{ title: 'Attendance' }} />
      <LearningStack.Screen name="ScanUpload" component={ScanUploadScreen} options={{ title: 'Scan upload' }} />
      <LearningStack.Screen name="Exams" component={ExamsScreen} options={{ title: 'Exams' }} />
      <LearningStack.Screen name="AIStudio" component={AIStudioScreen} options={{ title: 'AI Studio' }} />
    </LearningStack.Navigator>
  )
}

function ProfileNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={stackScreenOptions}>
      <ProfileStack.Screen name="ProfileMain" component={ProfileScreen} options={{ title: 'Profile' }} />
    </ProfileStack.Navigator>
  )
}

function StudentTabs({ competitive = false }: { competitive?: boolean }) {
  return (
    <Tab.Navigator
      initialRouteName="Home"
      tabBar={(props) => <BottomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen name="Home">
        {() => <HomeScreen competitive={competitive} />}
      </Tab.Screen>
      <Tab.Screen name="Learning" options={{ title: 'Learning' }}>
        {() => <LearningNavigator competitive={competitive} />}
      </Tab.Screen>
      <Tab.Screen name="Papers" component={PapersNavigator} options={{ title: 'Papers' }} />
      <Tab.Screen name="Results" component={ResultsNavigator} options={{ title: 'Results' }} />
      <Tab.Screen name="Profile" component={ProfileNavigator} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  )
}

function StaffWorkspaceNavigator() {
  return (
    <StaffWorkspaceStack.Navigator screenOptions={stackScreenOptions}>
      <StaffWorkspaceStack.Screen name="StaffWorkspace" component={WorkspaceScreen} options={{ title: 'Workspace' }} />
      <StaffWorkspaceStack.Screen name="Feature" component={FeatureScreen} options={{ title: 'Feature' }} />
      <StaffWorkspaceStack.Screen name="Approvals" component={ApprovalsScreen} options={{ title: 'Approvals' }} />
      <StaffWorkspaceStack.Screen name="Attendance" component={AttendanceScreen} options={{ title: 'Attendance' }} />
      <StaffWorkspaceStack.Screen name="ScanUpload" component={ScanUploadScreen} options={{ title: 'Scan upload' }} />
      <StaffWorkspaceStack.Screen name="Exams" component={ExamsScreen} options={{ title: 'Exams' }} />
      <StaffWorkspaceStack.Screen name="StaffAIStudio" component={AIStudioScreen} options={{ title: 'AI Studio' }} />
      <StaffWorkspaceStack.Screen name="StaffGeneratePaper" component={GeneratePaperScreen} options={{ title: 'Generate paper' }} />
      <StaffWorkspaceStack.Screen name="StaffPapers" component={PapersScreen} options={{ title: 'Papers' }} />
      <StaffWorkspaceStack.Screen name="StaffResults" component={ResultsScreen} options={{ title: 'Checked papers' }} />
      <StaffWorkspaceStack.Screen name="ResultDetail" component={ResultDetailScreen} options={{ title: 'Result detail' }} />
      <StaffWorkspaceStack.Screen name="ClassTeacherOverview" component={ClassTeacherOverviewScreen} options={{ title: 'My class' }} />
      <StaffWorkspaceStack.Screen name="ClassRoster" component={ClassRosterScreen} options={{ title: 'Roster and divisions' }} />
      <StaffWorkspaceStack.Screen name="ClassSubjects" component={ClassSubjectsScreen} options={{ title: 'Subjects and enrollment' }} />
      <StaffWorkspaceStack.Screen name="SubjectEnrollment" component={SubjectEnrollmentScreen} options={{ title: 'Subject enrollment' }} />
      <StaffWorkspaceStack.Screen name="ClassValidation" component={ClassValidationScreen} options={{ title: 'Validation report' }} />
    </StaffWorkspaceStack.Navigator>
  )
}

function StaffTabs() {
  return (
    <StaffTab.Navigator
      tabBar={(props) => <BottomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <StaffTab.Screen name="StaffHome" component={StaffWorkspaceNavigator} options={{ title: 'Workspace' }} />
      <StaffTab.Screen name="StaffApprovals" component={ApprovalsScreen} options={{ title: 'Approvals' }} />
      <StaffTab.Screen name="StaffAttendance" component={AttendanceScreen} options={{ title: 'Attendance' }} />
      <StaffTab.Screen name="StaffScanUpload" component={ScanUploadScreen} options={{ title: 'Scan' }} />
      <StaffTab.Screen name="StaffExams" component={ExamsScreen} options={{ title: 'Exams' }} />
      <StaffTab.Screen name="StaffPapers" component={PapersNavigator} options={{ title: 'Papers' }} />
      <StaffTab.Screen name="StaffResults" component={ResultsNavigator} options={{ title: 'Results' }} />
      <StaffTab.Screen name="StaffAIStudio" component={AIStudioScreen} options={{ title: 'AI Studio' }} />
    </StaffTab.Navigator>
  )
}

function B2COnboardingScreen() {
  return <ProfileScreen mode="onboarding" />
}

function OnboardingNavigator() {
  return (
    <OnboardingStack.Navigator screenOptions={{ headerShown: false }}>
      <OnboardingStack.Screen name="B2COnboarding" component={B2COnboardingScreen} />
    </OnboardingStack.Navigator>
  )
}

function AuthenticatedNavigator({ user }: { user: AccountMinimal }) {
  const landing = resolveMobileLanding(user)
  if (landing === 'b2c_onboarding') return <OnboardingNavigator />
  if (landing === 'competitive_learner') return <StudentTabs competitive />
  if (landing === 'school_learner') return <StudentTabs />
  if (landing === 'admin_workspace') return <StaffTabs />
  if (landing === 'developer_workspace') return <StaffTabs />
  return <StaffTabs />
}

export default function RootNavigator() {
  const { isAuthenticated, isLoading, user } = useAuthStore()

  if (isLoading) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.loadingText}>Loading Eduraa</Text>
      </View>
    )
  }

  const landingKey = user ? resolveMobileLanding(user) : 'auth'
  return (
    <NavigationContainer key={landingKey}>
      {isAuthenticated && user ? <AuthenticatedNavigator user={user} /> : <AuthNavigator />}
    </NavigationContainer>
  )
}

const styles = StyleSheet.create({
  loadingRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[3],
    backgroundColor: colors.background,
  },
  loadingText: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  roleGateContent: {
    justifyContent: 'center',
  },
  roleGateCard: {
    gap: spacing[3],
  },
  rolePill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.borderBrand,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  rolePillText: {
    color: colors.accentStrong,
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  roleGateTitle: {
    color: colors.text,
    fontFamily: fonts.displaySemibold,
    fontSize: 22,
    lineHeight: 28,
  },
  roleGateCopy: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 21,
  },
})
