import { CodeEditor } from "@/components/package-port/CodeEditor"
import { usePackageVisibilitySettingsDialog } from "@/components/dialogs/package-visibility-settings-dialog"
import { useAxios } from "@/hooks/use-axios"
import { useGlobalStore } from "@/hooks/use-global-store"
import { useToast } from "@/hooks/use-toast"
import { useUrlParams } from "@/hooks/use-url-params"
import useWarnUserOnPageChange from "@/hooks/use-warn-user-on-page-change"
import { decodeUrlHashToText } from "@/lib/decodeUrlHashToText"
import { getSnippetTemplate } from "@/lib/get-snippet-template"
import { cn } from "@/lib/utils"
import type { Package } from "fake-snippets-api/lib/db/schema"
import { Loader2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import EditorNav from "@/components/package-port/EditorNav"
import { SuspenseRunFrame } from "../SuspenseRunFrame"
import { applyEditEventsToManualEditsFile } from "@tscircuit/core"
import { usePackageFileById, usePackageFiles } from "@/hooks/use-package-files"
import { useCreatePackageMutation } from "@/hooks/use-create-package-mutation"
import { useCreatePackageReleaseMutation } from "@/hooks/use-create-package-release-mutation"
import { useUpdatePackageFilesMutation } from "@/hooks/useUpdatePackageFilesMutation"
import { useUpdatePackageMutation } from "@/hooks/useUpdatePackageMutation"
import { usePackageFilesLoader } from "@/hooks/usePackageFilesLoader"
import { findTargetFile } from "@/lib/utils/findTargetFile"
import { toastManualEditConflicts } from "@/lib/utils/toastManualEditConflicts"

interface Props {
  pkg?: Package
}

export interface PackageFile {
  path: string
  content: string
}

const DEFAULT_MANUAL_EDITS = ""
const DEFAULT_CODE = `
export default () => (
  <board width="10mm" height="10mm">
    {/* write your code here! */}
  </board>
)
`.trim()

const generateRandomPackageName = () =>
  `untitled-package-${Math.floor(Math.random() * 90) + 10}`

export function CodeAndPreview({ pkg }: Props) {
  const { toast } = useToast()
  const isLoggedIn = useGlobalStore((s) => Boolean(s.session))
  const loggedInUser = useGlobalStore((s) => s.session)
  const urlParams = useUrlParams()

  const templateFromUrl = useMemo(
    () => (urlParams.template ? getSnippetTemplate(urlParams.template) : null),
    [urlParams.template],
  )

  const pkgFiles = usePackageFiles(pkg?.latest_package_release_id)
  const indexFileFromHook = usePackageFileById(
    pkgFiles.data?.find((x) => x.file_path === "index.tsx")?.package_file_id ??
      null,
  )

  const defaultCode = useMemo(() => {
    if (indexFileFromHook.data?.content_text)
      return indexFileFromHook.data.content_text
    return (
      templateFromUrl?.code ??
      decodeUrlHashToText(window.location.toString()) ??
      (urlParams.package_id ? "" : DEFAULT_CODE)
    )
  }, [indexFileFromHook.data, templateFromUrl, urlParams.package_id])

  const manualEditsFileFromHook = usePackageFileById(
    pkgFiles.data?.find((x) => x.file_path === "manual-edits.json")
      ?.package_file_id ?? null,
  )

  const defaultManualEditsContent = useMemo(() => {
    if (manualEditsFileFromHook.data?.content_text)
      return manualEditsFileFromHook.data.content_text
    else return null
  }, [manualEditsFileFromHook.data])
  interface CodeAndPreviewState {
    pkgFilesWithContent: PackageFile[]
    initialFilesLoad: PackageFile[]
    showPreview: boolean
    fullScreen: boolean
    dts: string
    lastSavedAt: number
    circuitJson: null | any
    isPrivate: boolean
    lastRunCode: string
    code: string
    manualEditsFileContent: string
    pkgFilesLoaded: boolean
  }

  const [state, setState] = useState<CodeAndPreviewState>({
    pkgFilesWithContent: !pkg
      ? [
          { path: "index.tsx", content: defaultCode },
          {
            path: "manual-edits.json",
            content: defaultManualEditsContent || DEFAULT_MANUAL_EDITS,
          },
        ]
      : [],
    initialFilesLoad: [],
    showPreview: true,
    fullScreen: false,
    dts: "",
    lastSavedAt: Date.now(),
    circuitJson: null,
    isPrivate: false,
    lastRunCode: defaultCode,
    code: defaultCode,
    manualEditsFileContent: defaultManualEditsContent || DEFAULT_MANUAL_EDITS,
    pkgFilesLoaded: !urlParams.package_id,
  })

  const entryPointCode = useMemo(() => {
    const entryPointFile = findTargetFile(state.pkgFilesWithContent, null)
    if (entryPointFile?.content) return entryPointFile.content
    return (
      state.pkgFilesWithContent.find((x) => x.path === "index.tsx")?.content ??
      defaultCode
    )
  }, [state.pkgFilesWithContent, defaultCode])

  const packageType =
    pkg?.snippet_type ?? templateFromUrl?.type ?? urlParams.snippet_type

  const { Dialog: NewPackageSaveDialog, openDialog: openNewPackageSaveDialog } =
    usePackageVisibilitySettingsDialog()

  useEffect(() => {
    if (entryPointCode !== state.code) {
      setState((prev) => ({ ...prev, code: entryPointCode }))
    }
  }, [entryPointCode])

  const { data: loadedFiles, isLoading: isLoadingFiles } =
    usePackageFilesLoader(pkg)

  useEffect(() => {
    if (!pkgFiles.data?.length) {
      if (pkg && state.pkgFilesWithContent.length === 0) {
        const defaultFiles = [
          { path: "index.tsx", content: defaultCode },
          {
            path: "manual-edits.json",
            content: defaultManualEditsContent || DEFAULT_MANUAL_EDITS,
          },
        ]
        setState((prev) => ({
          ...prev,
          pkgFilesWithContent: defaultFiles,
          initialFilesLoad: defaultFiles,
          lastRunCode: defaultCode,
        }))
      }
      return
    }

    if (loadedFiles && !isLoadingFiles) {
      const processedResults = [...loadedFiles]
      if (!processedResults.some((f) => f.path === "manual-edits.json")) {
        processedResults.push({
          path: "manual-edits.json",
          content: DEFAULT_MANUAL_EDITS,
        })
      }

      setState((prev) => ({
        ...prev,
        pkgFilesWithContent: processedResults,
        pkgFilesLoaded: true,
        initialFilesLoad: processedResults,
        lastRunCode:
          processedResults.find((x) => x.path === "index.tsx")?.content ??
          defaultCode,
      }))
    }
  }, [
    isLoadingFiles,
    pkg,
    pkgFiles.data,
    state.pkgFilesWithContent.length,
    defaultCode,
  ])

  const createPackageMutation = useCreatePackageMutation()
  const { mutate: createRelease } = useCreatePackageReleaseMutation({
    onSuccess: () => {
      toast({
        title: "Package released",
        description: "Your package has been released successfully.",
      })
    },
  })

  const axios = useAxios()
  const loadPkgFiles = () => pkgFiles.refetch()

  const updatePackageFilesMutation = useUpdatePackageFilesMutation({
    pkg,
    pkgFilesWithContent: state.pkgFilesWithContent,
    initialFilesLoad: state.initialFilesLoad,
    pkgFiles,
    axios,
    toast,
    loadPkgFiles,
  })

  const updatePackageMutation = useUpdatePackageMutation({
    pkg,
    code: state.code,
    dts: state.dts,
    circuitJson: state.circuitJson,
    manualEditsFileContent: state.manualEditsFileContent,
  })

  const hasUnsavedChanges = useMemo(
    () =>
      !updatePackageMutation.isLoading &&
      Date.now() - state.lastSavedAt > 1000 &&
      state.pkgFilesWithContent.some((file) => {
        const initialFile = state.initialFilesLoad.find(
          (x) => x.path === file.path,
        )
        return initialFile?.content !== file.content
      }),
    [
      state.pkgFilesWithContent,
      state.initialFilesLoad,
      updatePackageMutation.isLoading,
      state.lastSavedAt,
    ],
  )

  useWarnUserOnPageChange({ hasUnsavedChanges })

  const handleNewPackageSaveRequest = async (isPrivate: boolean) => {
    setState((prev) => ({ ...prev, lastSavedAt: Date.now() }))
    const newPackage = await createPackageMutation.mutateAsync({
      name: `${loggedInUser?.github_username}/${generateRandomPackageName()}`,
      is_private: isPrivate,
    })

    if (newPackage) {
      createRelease(
        {
          package_name_with_version: `${newPackage.name}@latest`,
        },
        {
          onSuccess: () => {
            updatePackageFilesMutation.mutate({
              package_name_with_version: `${newPackage.name}@latest`,
              ...newPackage,
            })
          },
        },
      )
    }
  }

  const handleSave = async () => {
    if (!isLoggedIn) {
      toast({
        title: "Not Logged In",
        description: "You must be logged in to save your package.",
        variant: "destructive",
      })
      return
    }

    if (!pkg) {
      openNewPackageSaveDialog()
      return
    }

    setState((prev) => ({ ...prev, lastSavedAt: Date.now() }))

    if (pkg) {
      updatePackageMutation.mutate()
      updatePackageFilesMutation.mutate({
        package_name_with_version: `${pkg.name}@latest`,
        ...pkg,
      })
    }
  }

  const fsMap = useMemo(() => {
    const possibleExportNames = [
      ...(state.code.match(/export function (\w+)/)?.slice(1) ?? []),
      ...(state.code.match(/export const (\w+) ?=/)?.slice(1) ?? []),
    ]

    const exportName = possibleExportNames[0]
    const importStatement = exportName
      ? `import { ${exportName} as Package } from "./index.tsx"`
      : `import Package from "./index.tsx"`

    const hasBoard =
      /<\s*board\s*\/\s*>|<\s*board\s*[^>]*>[\s\S]*?<\/\s*board\s*>/.test(
        state.code,
      )

    const entrypointContent =
      packageType === "board"
        ? `${importStatement}\ncircuit.add(<Package />)`
        : `${importStatement}\ncircuit.add(${hasBoard ? '<Package name="U1" />' : `<board>\n  <Package name="U1" />\n</board>`})`

    return {
      ...state.pkgFilesWithContent.reduce(
        (acc, file) => {
          acc[file.path] = file.content
          return acc
        },
        {} as Record<string, string>,
      ),
      "index.tsx": entryPointCode ?? "// No Default Code Found",
      "manual-edits.json": state.manualEditsFileContent ?? "{}",
      "main.tsx": entrypointContent.trim(),
    }
  }, [
    state.manualEditsFileContent,
    entryPointCode,
    state.code,
    packageType,
    state.pkgFilesWithContent,
  ])

  if ((!pkg && urlParams.package_id) || pkgFiles.isLoading || isLoadingFiles) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center justify-center">
          <div className="text-lg text-gray-500 mb-4">Loading</div>
          <Loader2 className="w-16 h-16 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-[50vh]">
      <EditorNav
        circuitJson={state.circuitJson}
        pkg={pkg}
        packageType={packageType}
        code={state.code}
        isSaving={updatePackageMutation.isLoading}
        hasUnsavedChanges={hasUnsavedChanges}
        onSave={handleSave}
        onTogglePreview={() =>
          setState((prev) => ({ ...prev, showPreview: !prev.showPreview }))
        }
        previewOpen={state.showPreview}
      />
      <div
        className={`flex ${state.showPreview ? "flex-col md:flex-row" : ""}`}
      >
        <div
          className={cn(
            "hidden flex-col md:flex border-r border-gray-200 bg-gray-50",
            state.showPreview ? "w-full md:w-1/2" : "w-full flex",
          )}
        >
          <CodeEditor
            files={state.pkgFilesWithContent}
            onCodeChange={(newCode, filename) => {
              const targetFilename = filename ?? "index.tsx"
              setState((prev) => ({
                ...prev,
                pkgFilesWithContent: prev.pkgFilesWithContent.map((file) =>
                  file.path === targetFilename
                    ? { ...file, content: newCode }
                    : file,
                ),
              }))
            }}
            onDtsChange={(dts) => setState((prev) => ({ ...prev, dts }))}
            pkgFilesLoaded={state.pkgFilesLoaded}
          />
        </div>
        {state.showPreview && (
          <div
            className={cn(
              "flex p-0 flex-col min-h-[640px]",
              state.fullScreen
                ? "fixed inset-0 z-50 bg-white p-4 overflow-hidden"
                : "w-full md:w-1/2",
            )}
          >
            <SuspenseRunFrame
              showRunButton
              forceLatestEvalVersion
              onRenderStarted={() =>
                setState((prev) => ({ ...prev, lastRunCode: state.code }))
              }
              onRenderFinished={({ circuitJson }) => {
                setState((prev) => ({ ...prev, circuitJson }))
                toastManualEditConflicts(circuitJson, toast)
              }}
              onEditEvent={(event) => {
                const parsedManualEdits = JSON.parse(
                  state.manualEditsFileContent || "{}",
                )
                const newManualEditsFileContent =
                  applyEditEventsToManualEditsFile({
                    circuitJson: state.circuitJson,
                    editEvents: [event],
                    manualEditsFile: parsedManualEdits,
                  })
                setState((prev) => ({
                  ...prev,
                  manualEditsFileContent: JSON.stringify(
                    newManualEditsFileContent,
                    null,
                    2,
                  ),
                  pkgFilesWithContent: prev.pkgFilesWithContent.map((file) =>
                    file.path === "manual-edits.json"
                      ? {
                          ...file,
                          content: JSON.stringify(
                            newManualEditsFileContent,
                            null,
                            2,
                          ),
                        }
                      : file,
                  ),
                }))
              }}
              fsMap={fsMap}
              entrypoint="main.tsx"
            />
          </div>
        )}
      </div>
      <NewPackageSaveDialog
        initialIsPrivate={false}
        onSave={handleNewPackageSaveRequest}
      />
    </div>
  )
}
