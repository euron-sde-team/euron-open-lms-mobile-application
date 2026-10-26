/**
 * A certificate's public verification view, for anyone with the serial: learner, course,
 * issue date, serial and whether it is valid or revoked. The owner also gets the PDF,
 * downloaded into the cache and shown in an in-app PDF viewer, and can share the file or
 * the public verification link.
 */
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { BadgeCheck, Share2, ShieldAlert, X } from "lucide-react-native";
import Pdf from "react-native-pdf";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Certificate } from "../../../api/vendor/types";
import { qk } from "../../../app/query";
import type { RootScreen } from "../../../app/routes";
import { useApi, useSession } from "../../../app/session";
import { Button, IconButton } from "../../../ui/components/Button";
import { EmptyState, ErrorState, Skeleton } from "../../../ui/components/Feedback";
import { Header, Row, Screen } from "../../../ui/components/Layout";
import { Text } from "../../../ui/components/Text";
import { useTheme } from "../../../ui/theme/ThemeProvider";
import { space } from "../../../ui/theme/tokens";
import { errorText, formatLongDate, InlineError, isNotFound } from "../shared";
import { downloadCertificatePdf, normaliseSerial, sharePdf, shareVerifyLink } from "./certificate-pdf";

export function CertificateScreen({ route, navigation }: RootScreen<"Certificate">) {
  const serial = normaliseSerial(route.params.serial);
  const api = useApi();
  const { status } = useSession();
  const signedIn = status === "signedIn";
  const back = navigation.canGoBack() ? () => navigation.goBack() : () => navigation.navigate("Tabs");

  const cert = useQuery({
    queryKey: qk.certificate(serial),
    queryFn: () => api.certificates.verify(serial),
    // Signed in: always refetch, so the owner gets a fresh signed PDF link.
    staleTime: signedIn ? 0 : 60_000,
  });
  // Tells the owner apart while the PDF is still rendering (pdfUrl is null until then).
  const mine = useQuery({ queryKey: qk.certificates, queryFn: () => api.my.certificates(), enabled: signedIn });

  if (cert.isPending) {
    return (
      <View style={styles.fill}>
        <Header title="Certificate" onBack={back} />
        <Screen>
          <CertificateSkeleton />
        </Screen>
      </View>
    );
  }
  if (cert.isError || !cert.data) {
    return (
      <View style={styles.fill}>
        <Header title="Certificate" onBack={back} />
        {isNotFound(cert.error) ? (
          <EmptyState title="No certificate has this serial" body="Check the serial for typos. It is printed at the bottom of every certificate." testID="certificate-not-found" />
        ) : (
          <ErrorState message={errorText(cert.error)} onRetry={() => cert.refetch()} />
        )}
      </View>
    );
  }
  const c = cert.data;
  const owner = !!c.pdfUrl || !!mine.data?.some((m) => m.serial === c.serial);
  return (
    <View style={styles.fill}>
      <Header title="Certificate" onBack={back} />
      <Screen refreshing={cert.isRefetching} onRefresh={() => cert.refetch()} testID="certificate">
        <CertificateBody certificate={c} onOpenCourse={() => navigation.navigate("Course", { slug: c.courseSlug })} />
        <Actions certificate={c} owner={owner} />
      </Screen>
    </View>
  );
}

function StatusLine({ certificate: c }: { certificate: Certificate }) {
  const { colors } = useTheme();
  return (
    <View style={styles.status} accessibilityRole="summary" testID="certificate-status">
      {c.revoked ? <ShieldAlert size={20} color={colors.danger} /> : <BadgeCheck size={20} color={colors.success} />}
      <View style={styles.flex1}>
        <Text variant="bodyStrong" tone={c.revoked ? "danger" : "success"}>{c.revoked ? "Revoked" : "Valid"}</Text>
        <Text variant="small" tone="muted" style={styles.mt2}>
          {c.revoked
            ? `This certificate was revoked${c.revokedAt ? ` on ${formatLongDate(c.revokedAt)}` : ""} and is no longer valid.`
            : `Issued by ${c.academyName} on ${formatLongDate(c.issuedAt)}.`}
        </Text>
      </View>
    </View>
  );
}

function CertificateBody({ certificate: c, onOpenCourse }: { certificate: Certificate; onOpenCourse: () => void }) {
  return (
    <View>
      <StatusLine certificate={c} />
      <View style={styles.document} accessibilityLabel={`Certificate ${c.serial}`}>
        <Text variant="eyebrow" tone="primary" center>{c.academyName}</Text>
        <Text variant="eyebrow" tone="subtle" center style={{ marginTop: space[6] }}>Certificate of completion</Text>
        <Text tone="muted" center style={{ marginTop: space[5] }}>This certifies that</Text>
        <Text variant="title" center style={[{ marginTop: space[2] }, c.revoked && styles.struck]} testID="certificate-learner">{c.learnerName}</Text>
        <Text tone="muted" center style={{ marginTop: space[4] }}>has completed the course</Text>
        <Pressable accessibilityRole="link" accessibilityLabel={`Open ${c.courseTitle}`} onPress={onOpenCourse} hitSlop={6}>
          <Text variant="heading" center style={{ marginTop: space[2] }} testID="certificate-course">{c.courseTitle}</Text>
        </Pressable>
        {c.instructorNames.length ? <Text variant="small" tone="muted" center style={{ marginTop: space[3] }}>{`Taught by ${c.instructorNames.join(", ")}`}</Text> : null}
      </View>
      <Row label="Issued" value={formatLongDate(c.issuedAt)} />
      <Row label="Serial" value={c.serial} testID="certificate-serial" last />
    </View>
  );
}

function Actions({ certificate: c, owner }: { certificate: Certificate; owner: boolean }) {
  const api = useApi();
  const { colors } = useTheme();
  const [path, setPath] = useState<string | null>(null);
  const [busy, setBusy] = useState<"download" | "share" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);

  const ensurePdf = async (): Promise<string | null> => {
    if (path) return path;
    try {
      const p = await downloadCertificatePdf(api, c.serial);
      setPath(p);
      return p;
    } catch (e) {
      setError(errorText(e));
      return null;
    }
  };

  const open = async () => {
    setError(null);
    setBusy("download");
    const p = await ensurePdf();
    setBusy(null);
    if (p) setViewing(true);
  };

  const sharePdfFile = async () => {
    setError(null);
    setBusy("share");
    const p = await ensurePdf();
    setBusy(null);
    if (p) await sharePdf(p, c.serial).catch(() => setError("Could not open the share sheet."));
  };

  const shareLink = () => {
    setError(null);
    shareVerifyLink(c.serial, c.courseTitle).catch(() => setError("Could not open the share sheet."));
  };

  const canDownload = owner && !c.revoked && !!c.pdfUrl;
  return (
    <View style={styles.actions}>
      {owner && !c.revoked && !c.pdfUrl ? (
        <Text variant="small" tone="muted" testID="certificate-preparing">Your PDF is being prepared. Pull down to refresh in a minute.</Text>
      ) : null}
      {canDownload ? (
        <>
          <Button label={path ? "Open PDF" : "Download PDF"} onPress={() => open()} loading={busy === "download"} disabled={busy !== null} block testID="certificate-download" />
          <Button label="Share PDF" variant="outline" icon={<Share2 size={18} color={colors.foreground} />} onPress={() => sharePdfFile()} loading={busy === "share"} disabled={busy !== null} block testID="certificate-share-pdf" />
        </>
      ) : null}
      <Button label="Share verification link" variant={canDownload ? "ghost" : "outline"} onPress={shareLink} block testID="certificate-share-link" />
      <InlineError message={error} testID="certificate-error" />
      {path ? <PdfViewer visible={viewing} path={path} title={c.courseTitle} onClose={() => setViewing(false)} onShare={() => sharePdf(path, c.serial).catch(() => undefined)} /> : null}
    </View>
  );
}

function PdfViewer({ visible, path, title, onClose, onShare }: { visible: boolean; path: string; title: string; onClose: () => void; onShare: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [failed, setFailed] = useState(false);
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.fill, { backgroundColor: colors.background, paddingTop: insets.top }]} testID="certificate-pdf-viewer">
        <View style={[styles.viewerBar, { borderBottomColor: colors.border }]}>
          <IconButton label="Close" onPress={onClose} icon={<X size={24} color={colors.foreground} />} size={44} />
          <Text variant="subheading" numberOfLines={1} style={styles.viewerTitle}>{title}</Text>
          <IconButton label="Share PDF" onPress={onShare} icon={<Share2 size={22} color={colors.foreground} />} size={44} />
        </View>
        {failed ? (
          <EmptyState title="The PDF could not be shown" body="Share it to open it in another app." />
        ) : (
          <Pdf source={{ uri: path.startsWith("file://") ? path : `file://${path}` }} style={[styles.fill, { backgroundColor: colors.ground2 }]} trustAllCerts={false} onError={() => setFailed(true)} />
        )}
      </View>
    </Modal>
  );
}

function CertificateSkeleton() {
  return (
    <View testID="certificate-loading" accessibilityLabel="Loading">
      <Skeleton width="60%" height={18} style={{ marginTop: space[5] }} />
      <View style={[styles.document, styles.documentSkeleton]}>
        <Skeleton width={120} height={11} />
        <Skeleton width={180} height={12} style={{ marginTop: space[5] }} />
        <Skeleton width="70%" height={28} style={{ marginTop: space[3] }} />
        <Skeleton width="80%" height={22} style={{ marginTop: space[4] }} />
      </View>
      <Skeleton height={44} rounded={10} style={{ marginTop: space[8] }} />
    </View>
  );
}

const styles = StyleSheet.create({
  documentSkeleton: { alignItems: "center", gap: space[3] },
  mt2: { marginTop: 2 },
  flex1: { flex: 1 },
  fill: { flex: 1 },
  status: { flexDirection: "row", alignItems: "flex-start", gap: space[3], marginTop: space[5] },
  document: { paddingVertical: space[10], paddingHorizontal: space[2] },
  struck: { textDecorationLine: "line-through" },
  actions: { marginTop: space[8], gap: space[3] },
  viewerBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: space[2], height: 52, borderBottomWidth: StyleSheet.hairlineWidth },
  viewerTitle: { flex: 1, textAlign: "center" },
});
