Imports System.Threading
Imports System.ComponentModel

Class MainWindow

    Private ReadOnly backgroundWorker1 As New BackgroundWorker

    Public Sub New()

        ' This call is required by the designer.
        InitializeComponent()

        ' Add any initialization after the InitializeComponent() call.

    End Sub

    Private Sub OnLoad(ByVal sender As Object, ByVal e As RoutedEventArgs)
        versionLabel.Content = My.Application.Info.Version.ToString

    End Sub



    Private Sub Button_Click(sender As Object, e As RoutedEventArgs)
        ' Configure open file dialog box
        Dim dlg As New Microsoft.Win32.OpenFileDialog()
        dlg.FileName = "Comp" ' Default file name
        dlg.DefaultExt = ".nk" ' Default file extension
        dlg.Filter = "Nuke Scripts|*.nk|Blender Scene|*.blend" ' Filter files by extension

        ' Show open file dialog box
        Dim result? As Boolean = dlg.ShowDialog()

        ' Process open file dialog box results
        If result = True Then
            ' Open document
            Dim filename As String = dlg.FileName

            Dim li As ListViewItem = New ListViewItem()

            li.Foreground = New SolidColorBrush(Color.FromRgb(2, 168, 243))

            li.Content = filename


            ScriptList.Items.Add(li)



        End If
    End Sub

    Private Sub OnClear_Click(sender As Object, e As RoutedEventArgs) Handles onClear.Click
        ScriptList.Items.Clear()
    End Sub

    Public Sub backgroundWorker1_ProgressChanged(ByVal sender As Object, ByVal e As ProgressChangedEventArgs)
        versionLabel.Content = e.ProgressPercentage.ToString + "% Complete. Rendering " + e.UserState.ToString + " out of " + ScriptList.Items.Count.ToString
        Try


            ScriptList.Items.Item(e.UserState - 1).Foreground = New SolidColorBrush(Color.FromRgb(255, 152, 0))

            ScriptList.Items.Item(e.UserState - 2).Foreground = New SolidColorBrush(Color.FromRgb(174, 234, 0))

        Catch ex As Exception

        End Try

        progressBar1.Value = e.ProgressPercentage
        progressBar1.Foreground = New SolidColorBrush(Color.FromRgb(1, 118, 188))
    End Sub

    Private Sub backgroundWorker1_RunWorkerCompleted(ByVal sender As Object, ByVal e As RunWorkerCompletedEventArgs)
        versionLabel.Content = "All renders completed"
        btnRender.IsHitTestVisible = True
        btnRender.Content = "Render Jobs"
        progressBar1.Value = 100
        progressBar1.Foreground = New SolidColorBrush(Color.FromRgb(174, 234, 0))
        ScriptList.Items.Item(ScriptList.Items.Count - 1).Foreground = New SolidColorBrush(Color.FromRgb(174, 234, 0))
    End Sub

    Public Class ArgumentType
        Public _nukePath As String
        Public _nukeExe As String
        Public _blenderPath As String
        Public _blenderExe As String
        Public _list As ListView
    End Class

    Public Sub backgroundWorker1_DoWork(sender As Object, e As DoWorkEventArgs)

        Dispatcher.Invoke(Sub()

                              btnRender.IsHitTestVisible = False
                              btnRender.Content = "Rendering..."

                          End Sub)

        Dim args As ArgumentType = e.Argument

        Dim i As Integer = 1
        Dim x As Integer = ScriptList.Items.Count
        For Each item In args._list.Items


            Dim progperc As New Integer
            progperc = ((i - 0.5) / x) * 100
            backgroundWorker1.WorkerReportsProgress = True
            backgroundWorker1.ReportProgress(progperc, i)



            Dim filename As String
            Dispatcher.Invoke(Sub()

                                  filename = item.ToString

                              End Sub)

            Dim nukePath As String = args._nukePath
            Dim nukeExe As String = args._nukeExe
            Dim BlenderPath As String = args._blenderPath
            Dim BlenderExe As String = args._blenderExe
            Dim t As New Thread(Sub()

                                    If filename.Contains(".nk") Then
                                        Process.Start(nukePath + nukeExe, "-x " + """" + filename + """").WaitForExit()
                                    ElseIf filename.Contains(".blend") Then
                                        Process.Start(BlenderPath + BlenderExe, "-b " + """" + filename + """" + "-a").WaitForExit()
                                    End If





                                End Sub)
            t.Name = "Renderer" + i.ToString
            t.Start()

            i = i + 1

            t.Join()
        Next
    End Sub

    Private Sub BtnRender_Click(sender As Object, e As RoutedEventArgs) Handles btnRender.Click

        backgroundWorker1.WorkerReportsProgress = True
        backgroundWorker1.WorkerSupportsCancellation = True
        AddHandler backgroundWorker1.DoWork, AddressOf backgroundWorker1_DoWork
        AddHandler backgroundWorker1.ProgressChanged, AddressOf backgroundWorker1_ProgressChanged
        AddHandler backgroundWorker1.RunWorkerCompleted, AddressOf backgroundWorker1_RunWorkerCompleted

        Dim args As ArgumentType = New ArgumentType()
        args._nukePath = nukePathBox.Text
        args._nukeExe = nukeExeBox.Text
        args._blenderPath = BlenderPathBox.Text
        args._blenderExe = BlenderExeBox.Text
        args._list = ScriptList

        backgroundWorker1.RunWorkerAsync(args)

    End Sub

    Private Sub OnSaveList_Click(sender As Object, e As RoutedEventArgs) Handles onSaveList.Click

        'open a save dialogue
        Dim dlg As New Microsoft.Win32.SaveFileDialog()
        dlg.FileName = "Document" ' Default file name
        dlg.DefaultExt = ".txt" ' Default file extension
        dlg.Filter = "Text file|*.txt" ' Filter files by extension

        ' Show save file dialog box
        Dim result? As Boolean = dlg.ShowDialog()

        ' Process save file dialog box results
        If result = True Then
            ' Save document
            Dim filename As String = dlg.FileName
            Dim sb As New System.Text.StringBuilder()

            For i = 0 To ScriptList.Items.Count - 1
                sb.AppendLine(ScriptList.Items.Item(i).ToString)
            Next

            System.IO.File.WriteAllText(filename, sb.ToString())
        Else
            MessageBox.Show("Not a valid directory to save list")
        End If





    End Sub

    Private Sub OnLoadList_Click(sender As Object, e As RoutedEventArgs) Handles onLoadList.Click

        ' Configure open file dialog box
        Dim dlg As New Microsoft.Win32.OpenFileDialog()
        dlg.FileName = "Text" ' Default file name
        dlg.DefaultExt = ".txt" ' Default file extension
        dlg.Filter = "Text File|*.txt" ' Filter files by extension

        ' Show open file dialog box
        Dim result? As Boolean = dlg.ShowDialog()

        ' Process open file dialog box results
        If result = True Then
            ' Open document
            Dim filename As String = dlg.FileName
            ScriptList.Items.Clear()
            ScriptList.ItemsSource = IO.File.ReadAllLines(filename)
        End If


    End Sub
End Class
