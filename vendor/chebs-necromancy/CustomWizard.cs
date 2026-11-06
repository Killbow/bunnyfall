using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using ChebsNecromancyMod.RoleplayRealismItemsMod;
using DaggerfallConnect;
using DaggerfallConnect.Arena2;
using DaggerfallWorkshop;
using DaggerfallWorkshop.Game;
using DaggerfallWorkshop.Game.Player;
using DaggerfallWorkshop.Game.UserInterface;
using DaggerfallWorkshop.Game.UserInterfaceWindows;
using DaggerfallWorkshop.Game.Utility;
using UnityEngine;
using Random = UnityEngine.Random;

namespace ChebsNecromancyMod
{
    // DISCLAIMER: I know this is stupid! I don't like it either.
    //
    // The DFU source code implementation is really tight and locked down. We don't have access to things like
    // Harmony to do patching techniques and everything is made with restrictive scoping. The best I can come up
    // with for now is to create a clone of the character creation stuff that also implements my custom class and
    // open it instead of the original wizard.
    //
    // Injection via Harmony as described here:
    // https://forums.dfworkshop.net/viewtopic.php?t=4213
    //
    // Creating extra game files described here:
    // https://forums.dfworkshop.net/viewtopic.php?t=6226
    public class CustomStartNewGameWizard : DaggerfallBaseWindow
    {
        const string newGameCinematic1 = "ANIM0000.VID";
        const string newGameCinematic2 = "ANIM0011.VID";
        const string newGameCinematic3 = "DAG2.VID";

        StartNewGameWizard.WizardStages wizardStage;
        CharacterDocument characterDocument = new CharacterDocument();
        StartGameBehaviour startGameBehaviour;

        CreateCharRaceSelect createCharRaceSelectWindow;
        CreateCharGenderSelect createCharGenderSelectWindow;
        CreateCharChooseClassGen createCharChooseClassGenWindow;
        CreateCharClassQuestions createCharClassQuestionsWindow;
        CustomCreateCharClassSelect createCharClassSelectWindow;
        CreateCharCustomClass createCharCustomClassWindow;
        CreateCharChooseBio createCharChooseBioWindow;
        CreateCharBiography createCharBiographyWindow;
        CreateCharNameSelect createCharNameSelectWindow;
        CreateCharFaceSelect createCharFaceSelectWindow;
        CreateCharAddBonusStats createCharAddBonusStatsWindow;
        CreateCharAddBonusSkills createCharAddBonusSkillsWindow;
        CreateCharReflexSelect createCharReflexSelectWindow;
        CreateCharSummary createCharSummaryWindow;

        bool skillsNeedReroll;

        StartNewGameWizard.WizardStages WizardStage
        {
            get { return wizardStage; }
        }

        // public enum WizardStages
        // {
        //     SelectRace,
        //     SelectGender,
        //     SelectClassMethod,
        //     GenerateClass,
        //     SelectClassFromList,
        //     CustomClassBuilder,
        //     SelectBiographyMethod,
        //     BiographyQuestions,
        //     SelectName,
        //     SelectFace,
        //     AddBonusStats,
        //     AddBonusSkills,
        //     SelectReflexes,
        //     Summary,
        // }

        public CustomStartNewGameWizard(IUserInterfaceManager uiManager)
            : base(uiManager)
        {
        }

        protected override void Setup()
        {
            // Must have a start game object to transmit character sheet
            startGameBehaviour = GameObject.FindObjectOfType<StartGameBehaviour>();
            if (!startGameBehaviour)
                throw new Exception("Could not find StartGameBehaviour in scene.");

            // Wizard starts with race selection
            SetRaceSelectWindow();
        }

        public override void Update()
        {
            base.Update();

            // If user has backed out of all windows then drop back to start screen
            if (uiManager.TopWindow == this)
                CloseWindow();
        }

        #region Window Management

        void SetRaceSelectWindow()
        {
            if (createCharRaceSelectWindow == null)
            {
                createCharRaceSelectWindow = new CreateCharRaceSelect(uiManager);
                createCharRaceSelectWindow.OnClose += RaceSelectWindow_OnClose;
            }

            createCharRaceSelectWindow.Reset();
            characterDocument.raceTemplate = null;

            wizardStage = StartNewGameWizard.WizardStages.SelectRace;

            if (uiManager.TopWindow != createCharRaceSelectWindow)
                uiManager.PushWindow(createCharRaceSelectWindow);
        }

        void SetGenderSelectWindow()
        {
            if (createCharGenderSelectWindow == null)
            {
                createCharGenderSelectWindow = new CreateCharGenderSelect(uiManager, createCharRaceSelectWindow);
                createCharGenderSelectWindow.OnClose += GenderSelectWindow_OnClose;
            }

            wizardStage = StartNewGameWizard.WizardStages.SelectGender;
            uiManager.PushWindow(createCharGenderSelectWindow);
        }

        void SetChooseClassGenWindow()
        {
            createCharChooseClassGenWindow = new CreateCharChooseClassGen(uiManager, createCharRaceSelectWindow);
            createCharChooseClassGenWindow.OnClose += ChooseClassGen_OnClose;
            wizardStage = StartNewGameWizard.WizardStages.SelectClassMethod;
            uiManager.PushWindow(createCharChooseClassGenWindow);
        }

        void SetClassQuestionsWindow()
        {
            createCharClassQuestionsWindow = new CreateCharClassQuestions(uiManager);
            createCharClassQuestionsWindow.OnClose += CreateCharClassQuestions_OnClose;
            wizardStage = StartNewGameWizard.WizardStages.GenerateClass;
            uiManager.PushWindow(createCharClassQuestionsWindow);
        }

        void SetClassSelectWindow()
        {
            if (createCharClassSelectWindow == null)
            {
                createCharClassSelectWindow = new CustomCreateCharClassSelect(uiManager, createCharRaceSelectWindow);
                createCharClassSelectWindow.OnClose += ClassSelectWindow_OnClose;
            }

            wizardStage = StartNewGameWizard.WizardStages.SelectClassFromList;
            uiManager.PushWindow(createCharClassSelectWindow);
        }

        void SetCustomClassWindow()
        {
            createCharCustomClassWindow = new CreateCharCustomClass(uiManager);
            createCharCustomClassWindow.OnClose += CreateCharCustomClassWindow_OnClose;
            wizardStage = StartNewGameWizard.WizardStages.CustomClassBuilder;
            uiManager.PushWindow(createCharCustomClassWindow);
        }

        void SetChooseBioWindow()
        {
            createCharChooseBioWindow = new CreateCharChooseBio(uiManager, createCharRaceSelectWindow);
            createCharChooseBioWindow.OnClose += CreateCharChooseBioWindow_OnClose;

            wizardStage = StartNewGameWizard.WizardStages.SelectBiographyMethod;
            skillsNeedReroll = true;
            uiManager.PushWindow(createCharChooseBioWindow);
        }

        void SetBiographyWindow()
        {
            createCharBiographyWindow = new CreateCharBiography(uiManager, characterDocument);
            createCharBiographyWindow.OnClose += CreateCharBiographyWindow_OnClose;

            createCharBiographyWindow.ClassIndex = characterDocument.classIndex;
            wizardStage = StartNewGameWizard.WizardStages.BiographyQuestions;
            uiManager.PushWindow(createCharBiographyWindow);
        }

        void SetNameSelectWindow()
        {
            if (createCharNameSelectWindow == null)
            {
                createCharNameSelectWindow = new CreateCharNameSelect(uiManager);
                createCharNameSelectWindow.OnClose += NameSelectWindow_OnClose;
            }

            createCharNameSelectWindow.RaceTemplate = characterDocument.raceTemplate;
            createCharNameSelectWindow.Gender = characterDocument.gender;

            wizardStage = StartNewGameWizard.WizardStages.SelectName;
            uiManager.PushWindow(createCharNameSelectWindow);
        }

        void SetFaceSelectWindow()
        {
            if (createCharFaceSelectWindow == null)
            {
                createCharFaceSelectWindow = new CreateCharFaceSelect(uiManager);
                createCharFaceSelectWindow.OnClose += FaceSelectWindow_OnClose;
            }

            createCharFaceSelectWindow.SetFaceTextures(characterDocument.raceTemplate, characterDocument.gender);

            wizardStage = StartNewGameWizard.WizardStages.SelectFace;
            uiManager.PushWindow(createCharFaceSelectWindow);
        }

        void SetAddBonusStatsWindow()
        {
            if (createCharAddBonusStatsWindow == null)
            {
                createCharAddBonusStatsWindow = new CreateCharAddBonusStats(uiManager);
                createCharAddBonusStatsWindow.OnClose += AddBonusStatsWindow_OnClose;
                createCharAddBonusStatsWindow.DFClass = characterDocument.career;
                createCharAddBonusStatsWindow.Reroll();
            }

            // Update class and reroll if player changed class selection
            if (createCharAddBonusStatsWindow.DFClass != characterDocument.career)
            {
                createCharAddBonusStatsWindow.DFClass = characterDocument.career;
                createCharAddBonusStatsWindow.Reroll();
            }

            wizardStage = StartNewGameWizard.WizardStages.AddBonusStats;
            uiManager.PushWindow(createCharAddBonusStatsWindow);
        }

        void SetAddBonusSkillsWindow()
        {
            if (createCharAddBonusSkillsWindow == null)
            {
                createCharAddBonusSkillsWindow = new CreateCharAddBonusSkills(uiManager);
                createCharAddBonusSkillsWindow.OnClose += AddBonusSkillsWindow_OnClose;
            }

            createCharAddBonusSkillsWindow.SetCharacterDocument(characterDocument, !skillsNeedReroll);
            wizardStage = StartNewGameWizard.WizardStages.AddBonusSkills;
            uiManager.PushWindow(createCharAddBonusSkillsWindow);
        }

        void SetSelectReflexesWindow()
        {
            if (createCharReflexSelectWindow == null)
            {
                createCharReflexSelectWindow = new CreateCharReflexSelect(uiManager);
                createCharReflexSelectWindow.OnClose += ReflexSelectWindow_OnClose;
            }

            wizardStage = StartNewGameWizard.WizardStages.SelectReflexes;
            uiManager.PushWindow(createCharReflexSelectWindow);
        }

        void SetSummaryWindow()
        {
            if (createCharSummaryWindow == null)
            {
                createCharSummaryWindow = new CreateCharSummary(uiManager);
                createCharSummaryWindow.OnRestart += SummaryWindow_OnRestart;
                createCharSummaryWindow.OnClose += SummaryWindow_OnClose;
            }

            createCharSummaryWindow.CharacterDocument = characterDocument;

            wizardStage = StartNewGameWizard.WizardStages.Summary;
            uiManager.PushWindow(createCharSummaryWindow);
        }

        #endregion

        #region Event Handlers

        void RaceSelectWindow_OnClose()
        {
            if (!createCharRaceSelectWindow.Cancelled)
            {
                characterDocument.raceTemplate = createCharRaceSelectWindow.SelectedRace;
                SetGenderSelectWindow();
            }
            else
            {
                characterDocument.raceTemplate = null;
            }
        }

        void GenderSelectWindow_OnClose()
        {
            if (!createCharGenderSelectWindow.Cancelled)
            {
                characterDocument.gender = createCharGenderSelectWindow.SelectedGender;
                SetChooseClassGenWindow();
            }
            else
            {
                SetRaceSelectWindow();
            }
        }

        void ChooseClassGen_OnClose()
        {
            if (createCharChooseClassGenWindow.ChoseGenerate)
            {
                SetClassQuestionsWindow();
            }
            else
            {
                SetClassSelectWindow();
            }
        }

        void CreateCharClassQuestions_OnClose()
        {
            byte classIndex = createCharClassQuestionsWindow.ClassIndex;
            if (classIndex != CreateCharClassQuestions.noClassIndex)
            {
                string fileName = "CLASS" + classIndex.ToString("00") + ".CFG";
                string[] files = Directory.GetFiles(DaggerfallUnity.Instance.Arena2Path, fileName);
                if (files == null)
                {
                    throw new Exception("Could not load class file: " + fileName);
                }
                ClassFile classFile = new ClassFile(files[0]);
                characterDocument.career = classFile.Career;
                characterDocument.classIndex = classIndex;
                SetChooseBioWindow();
            }
            else
            {
                SetClassSelectWindow();
            }
        }

        void ClassSelectWindow_OnClose()
        {
            if (!createCharClassSelectWindow.Cancelled)
            {
                if (createCharClassSelectWindow.SelectedClass == null) // Custom class
                {
                    characterDocument.isCustom = true;
                    SetCustomClassWindow();
                }
                else
                {
                    characterDocument.career = createCharClassSelectWindow.SelectedClass;
                    characterDocument.classIndex = createCharClassSelectWindow.SelectedClassIndex;
                    SetChooseBioWindow();
                }
            }
            else
            {
                SetRaceSelectWindow();
            }
        }

        void CreateCharCustomClassWindow_OnClose()
        {
            if (!createCharCustomClassWindow.Cancelled)
            {
                characterDocument.career = createCharCustomClassWindow.CreatedClass;
                characterDocument.career.Name = createCharCustomClassWindow.ClassName;

                // Determine the most similar class so that we can choose the biography quiz
                characterDocument.classIndex = BiogFile.GetClassAffinityIndex(characterDocument.career, createCharClassSelectWindow.ClassList);

                // Set reputation adjustments
                characterDocument.reputationMerchants = createCharCustomClassWindow.MerchantsRep;
                characterDocument.reputationCommoners = createCharCustomClassWindow.PeasantsRep;
                characterDocument.reputationScholars = createCharCustomClassWindow.ScholarsRep;
                characterDocument.reputationNobility = createCharCustomClassWindow.NobilityRep;
                characterDocument.reputationUnderworld = createCharCustomClassWindow.UnderworldRep;

                // Set attributes
                characterDocument.career.Strength = createCharCustomClassWindow.Stats.WorkingStats.LiveStrength;
                characterDocument.career.Intelligence = createCharCustomClassWindow.Stats.WorkingStats.LiveIntelligence;
                characterDocument.career.Willpower = createCharCustomClassWindow.Stats.WorkingStats.LiveWillpower;
                characterDocument.career.Agility = createCharCustomClassWindow.Stats.WorkingStats.LiveAgility;
                characterDocument.career.Endurance = createCharCustomClassWindow.Stats.WorkingStats.LiveEndurance;
                characterDocument.career.Personality = createCharCustomClassWindow.Stats.WorkingStats.LivePersonality;
                characterDocument.career.Speed = createCharCustomClassWindow.Stats.WorkingStats.LiveSpeed;
                characterDocument.career.Luck = createCharCustomClassWindow.Stats.WorkingStats.LiveLuck;

                SetChooseBioWindow();
            }
            else
            {
                SetClassSelectWindow();
            }
        }

        void CreateCharChooseBioWindow_OnClose()
        {
            if (!createCharChooseBioWindow.Cancelled)
            {
                // Pick a biography template, 0 by default
                // Classic only has a T0 template for each class, but mods can add more
                Regex reg = new Regex($"BIOG{characterDocument.classIndex:D2}T([0-9]+).TXT");
                IEnumerable<Match> biogMatches = Directory.EnumerateFiles(BiogFile.BIOGSourceFolder, "*.TXT")
                    .Select(FilePath => reg.Match(FilePath))
                    .Where(FileMatch => FileMatch.Success);

                // For now, we choose at random between all available ones
                // Maybe eventually, have a window for selecting a biography template when more than 1 is available?
                int biogCount = biogMatches.Count();
                int selectedBio = Random.Range(0, biogCount);
                Match selectedMatch = biogMatches.ElementAt(selectedBio);
                characterDocument.biographyIndex = int.Parse(selectedMatch.Groups[1].Value);

                if (!createCharChooseBioWindow.ChoseQuestions)
                {
                    // Choose answers at random
                    System.Random rand = new System.Random(DateTime.Now.Millisecond);
                    BiogFile autoBiog = new BiogFile(characterDocument);
                    for (int i = 0; i < autoBiog.Questions.Length; i++)
                    {
                        List<BiogFile.Answer> answers;
                        answers = autoBiog.Questions[i].Answers;
                        int index = rand.Next(0, answers.Count);
                        for (int j = 0; j < answers[index].Effects.Count; j++)
                        {
                            autoBiog.AddEffect(answers[index].Effects[j], i);
                        }
                    }
                    // Show reputation changes
                    autoBiog.DigestRepChanges();
                    DaggerfallMessageBox messageBox = new DaggerfallMessageBox(uiManager, createCharChooseBioWindow);
                    messageBox.SetTextTokens(CreateCharBiography.reputationToken, autoBiog);
                    messageBox.ClickAnywhereToClose = true;
                    messageBox.Show();
                    messageBox.OnClose += ReputationBox_OnClose;

                    characterDocument.biographyEffects = autoBiog.AnswerEffects;
                    characterDocument.backStory = autoBiog.GenerateBackstory();
                }
                else
                {
                    SetBiographyWindow();
                }
            }
            else
            {
                SetClassSelectWindow();
            }
        }

        private void ReputationBox_OnClose()
        {
            SetNameSelectWindow();
        }

        void CreateCharBiographyWindow_OnClose()
        {
            if (!createCharBiographyWindow.Cancelled)
            {
                characterDocument.backStory = createCharBiographyWindow.BackStory;
                characterDocument.biographyEffects = createCharBiographyWindow.PlayerEffects;
                SetNameSelectWindow();
            }
            else
            {
                SetChooseBioWindow();
            }
        }

        void NameSelectWindow_OnClose()
        {
            if (!createCharNameSelectWindow.Cancelled)
            {
                characterDocument.name = createCharNameSelectWindow.CharacterName;
                SetFaceSelectWindow();
            }
            else
            {
                SetChooseBioWindow();
            }
        }

        void FaceSelectWindow_OnClose()
        {
            if (!createCharFaceSelectWindow.Cancelled)
            {
                characterDocument.faceIndex = createCharFaceSelectWindow.FaceIndex;
                SetAddBonusStatsWindow();
            }
            else
            {
                SetNameSelectWindow();
            }
        }

        void AddBonusStatsWindow_OnClose()
        {
            if (!createCharAddBonusStatsWindow.Cancelled)
            {
                characterDocument.startingStats.Copy(createCharAddBonusStatsWindow.StartingStats);
                characterDocument.workingStats.Copy(createCharAddBonusStatsWindow.WorkingStats);
                SetAddBonusSkillsWindow();
            }
            else
            {
                SetFaceSelectWindow();
            }
        }

        void AddBonusSkillsWindow_OnClose()
        {
            if (!createCharAddBonusSkillsWindow.Cancelled)
            {
                characterDocument.startingSkills.Copy(createCharAddBonusSkillsWindow.StartingSkills);
                characterDocument.workingSkills.Copy(createCharAddBonusSkillsWindow.WorkingSkills);
                SetSelectReflexesWindow();
                skillsNeedReroll = false;
            }
            else
            {
                // Copy current stats to bonus stats window.
                createCharAddBonusStatsWindow.StartingStats.Copy(characterDocument.startingStats);
                createCharAddBonusStatsWindow.WorkingStats.Copy(characterDocument.workingStats);
                SetAddBonusStatsWindow();
            }
        }

        void ReflexSelectWindow_OnClose()
        {
            if (!createCharReflexSelectWindow.Cancelled)
            {
                characterDocument.reflexes = createCharReflexSelectWindow.PlayerReflexes;
                SetSummaryWindow();
            }
            else
            {
                SetAddBonusSkillsWindow();
            }
        }

        private void SummaryWindow_OnRestart()
        {
            SetRaceSelectWindow();
        }

        void SummaryWindow_OnClose()
        {
            if (!createCharSummaryWindow.Cancelled)
            {
                characterDocument = createCharSummaryWindow.GetUpdatedCharacterDocument();
                if (characterDocument.career.Name == ChebsNecromancy.NecromancerCareerName)
                {
                    startGameBehaviour.AssignStartingEquipment = StartingEquipmentStuff.AssignSkillEquipment;
                    startGameBehaviour.AssignStartingSpells = (entity, document) =>
                    {
                        // the real spell a necromancer wants to start with: Animate Dead!
                        entity.AddSpell(ChebsNecromancy.AnimateDeadSpell);
                        // and give em a basic recall too
                        entity.AddSpell(ChebsNecromancy.NoviceRecallSpell);

                        // Some extra spells a necromancer might find useful.
                        // Classic spell indexes are on https://en.uesp.net/wiki/Daggerfall:SPELLS.STD_indices under Spell Catalogue
                        entity.AddSpell(StartingEquipmentStuff.GetClassicSpell(38)); // Jumping
                        entity.AddSpell(StartingEquipmentStuff.GetClassicSpell(2));  // Buoyancy
                        entity.AddSpell(StartingEquipmentStuff.GetClassicSpell(44)); // Chameleon
                        entity.AddSpell(StartingEquipmentStuff.GetClassicSpell(1));  // Fenrik's Door Jam
                        entity.AddSpell(StartingEquipmentStuff.GetClassicSpell(94)); // Recall!
                        entity.AddSpell(StartingEquipmentStuff.GetClassicSpell(97)); // Balyna's Balm

                        // Add a starter corpse so that they have something to reanimate right away
                        var starterCorpse = CustomCorpseItem.Create();
                        starterCorpse.RenameItem("My Last Apprentice. What was his name again?");
                        entity.Items.AddItem(starterCorpse);
                    };
                }
                StartNewGame();
            }
            else
            {
                // Copy skill and stat changes back to previous screens.
                characterDocument.startingSkills.Copy(createCharSummaryWindow.StartingSkills);
                characterDocument.workingSkills.Copy(createCharSummaryWindow.WorkingSkills);
                characterDocument.startingStats.Copy(createCharSummaryWindow.StartingStats);
                characterDocument.workingStats.Copy(createCharSummaryWindow.WorkingStats);
                var bonusSkillPoints = createCharSummaryWindow.BonusSkillPoints;
                createCharAddBonusSkillsWindow.SetBonusSkillPoints(bonusSkillPoints.Item1, bonusSkillPoints.Item2, bonusSkillPoints.Item3);
                characterDocument.faceIndex = createCharSummaryWindow.FaceIndex;
                SetSelectReflexesWindow();
            }
        }

        #endregion

        #region Game Startup Methods

        void StartNewGame()
        {
            // Assign character document to player entity
            startGameBehaviour.CharacterDocument = characterDocument;

            if (DaggerfallUI.Instance.enableVideos)
            {
                // Create cinematics
                DaggerfallVidPlayerWindow cinematic1 = (DaggerfallVidPlayerWindow)UIWindowFactory.GetInstanceWithArgs(UIWindowType.VidPlayer, new object[] { uiManager, newGameCinematic1 });
                DaggerfallVidPlayerWindow cinematic2 = (DaggerfallVidPlayerWindow)UIWindowFactory.GetInstanceWithArgs(UIWindowType.VidPlayer, new object[] { uiManager, newGameCinematic2 });
                DaggerfallVidPlayerWindow cinematic3 = (DaggerfallVidPlayerWindow)UIWindowFactory.GetInstanceWithArgs(UIWindowType.VidPlayer, new object[] { uiManager, newGameCinematic3 });

                // End of final cinematic will launch game
                cinematic3.OnVideoFinished += TriggerGame;

                // Push cinematics in reverse order so they play and pop out in correct order
                uiManager.PushWindow(cinematic3);
                uiManager.PushWindow(cinematic2);
                uiManager.PushWindow(cinematic1);
            }
            else
            {
                TriggerGame();
            }
        }

        void TriggerGame()
        {
            startGameBehaviour.StartMethod = StartGameBehaviour.StartMethods.NewCharacter;
        }

        #endregion
    }

    public class CustomCreateCharClassSelect : DaggerfallListPickerWindow
    {
        const int startClassDescriptionID = 2100;

        public List<DFCareer> classList = new List<DFCareer>();
        public DFCareer selectedClass;
        public int selectedClassIndex = 0;

        protected Dictionary<DFCareer, List<TextFile.Token>> CustomClasses;

        public DFCareer SelectedClass
        {
            get { return selectedClass; }
        }

        public CustomCreateCharClassSelect(IUserInterfaceManager uiManager, DaggerfallBaseWindow previous = null)
            : base(uiManager, previous)
        {
        }

        protected override void Setup()
        {
            base.Setup();

            // Read all CLASS*.CFG files and add to listbox
            string[] files = Directory.GetFiles(DaggerfallUnity.Instance.Arena2Path, "CLASS*.CFG");
            if (files != null && files.Length > 0)
            {
                for (int i = 0; i < files.Length - 1; i++)
                {
                    ClassFile classFile = new ClassFile(files[i]);
                    classList.Add(classFile.Career);
                    listBox.AddItem(TextManager.Instance.GetLocalizedText(classFile.Career.Name));
                }
            }

            CustomClasses = ChebsNecromancy.GetCustomClasses();

            foreach (var dfCareer in CustomClasses.Keys)
            {
                classList.Add(dfCareer);
                // todo: localize
                //listBox.AddItem(TextManager.Instance.GetLocalizedText(dfCareer.Name));
                listBox.AddItem(dfCareer.Name);
            }

            listBox.AddItem(TextManager.Instance.GetLocalizedText("Custom"));

            OnItemPicked += DaggerfallClassSelectWindow_OnItemPicked;
        }

        void DaggerfallClassSelectWindow_OnItemPicked(int index, string className)
        {
            ChebsNecromancy.ChebLog($"listBox.Count={listBox.Count}, classList.Count={classList.Count}, index={index}, className={className}");
            if (index >= classList.Count) // "Custom" option selected
            {
                selectedClass = null;
                selectedClassIndex = -1;
                CloseWindow();
            }
            else
            {
                selectedClass = classList[index];
                selectedClass.Name = className; // Ensures any localized display names are assigned after selection from list
                selectedClassIndex = index;

                if (CustomClasses.ContainsKey(selectedClass))
                {
                    ChebsNecromancy.ChebLog($"Custom class {className} chosen");
                    // don't read from file - there's not one. Generate
                    DaggerfallMessageBox messageBox = new DaggerfallMessageBox(uiManager, this);
                    var textTokens = CustomClasses[selectedClass];
                    // todo: SetTextTokens requires localization to work and will display empty until that's done
                    //messageBox.SetTextTokens(textTokens.ToArray());
                    messageBox.SetText(textTokens.Select(t => t.text).ToArray());
                    messageBox.AddButton(DaggerfallMessageBox.MessageBoxButtons.Yes);
                    Button noButton = messageBox.AddButton(DaggerfallMessageBox.MessageBoxButtons.No);
                    noButton.ClickSound = DaggerfallUI.Instance.GetAudioClip(SoundClips.ButtonClick);
                    messageBox.OnButtonClick += ConfirmClassPopup_OnButtonClick;
                    uiManager.PushWindow(messageBox);
                }
                else
                {
                    ChebsNecromancy.ChebLog($"Vanilla class {className} chosen");
                    TextFile.Token[] textTokens = DaggerfallUnity.Instance.TextProvider.GetRSCTokens(startClassDescriptionID + index);
                    DaggerfallMessageBox messageBox = new DaggerfallMessageBox(uiManager, this);
                    messageBox.SetTextTokens(textTokens);
                    messageBox.AddButton(DaggerfallMessageBox.MessageBoxButtons.Yes);
                    Button noButton = messageBox.AddButton(DaggerfallMessageBox.MessageBoxButtons.No);
                    noButton.ClickSound = DaggerfallUI.Instance.GetAudioClip(SoundClips.ButtonClick);
                    messageBox.OnButtonClick += ConfirmClassPopup_OnButtonClick;
                    uiManager.PushWindow(messageBox);
                }

                AudioClip clip = DaggerfallUnity.Instance.SoundReader.GetAudioClip(SoundClips.SelectClassDrums);
                DaggerfallUI.Instance.AudioSource.PlayOneShot(clip, DaggerfallUnity.Settings.SoundVolume);
            }
        }

        void ConfirmClassPopup_OnButtonClick(DaggerfallMessageBox sender, DaggerfallMessageBox.MessageBoxButtons messageBoxButton)
        {
            if (messageBoxButton == DaggerfallMessageBox.MessageBoxButtons.Yes)
            {
                sender.CloseWindow();
                CloseWindow();
            }
            else if (messageBoxButton == DaggerfallMessageBox.MessageBoxButtons.No)
            {
                selectedClass = null;
                sender.CancelWindow();
            }
        }

        public int SelectedClassIndex
        {
            get { return selectedClassIndex; }
        }

        public List<DFCareer> ClassList
        {
            get { return classList; }
        }
    }
}