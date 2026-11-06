using System.Collections;
using System.Linq;
using DaggerfallWorkshop;
using DaggerfallWorkshop.Utility;
using Newtonsoft.Json;
using UnityEngine;
using Random = UnityEngine.Random;

namespace ChebsNecromancyMod
{
    public class MinionSpawner : MonoBehaviour
    {
        public bool showHUDMessage = true;

        public MobileTypes foeType = MobileTypes.SkeletalWarrior;
        public int spawnCount = 1;
        public float maxDistance = 3f;
        public bool alliedToPlayer = true;

        public int magnitude;
        public int mysticismLevel;
        public int intelligence;
        public int willpower;

        private IEnumerator Start()
        {
            yield return new WaitForEndOfFrame();

            ChebsNecromancy.ChebLog($"{this} magnitude={magnitude}, mysticismLevel={mysticismLevel}, " +
                                    $"intelligence={intelligence}, willpower={willpower}");

            GameObjectHelper.CreateFoeGameObjects(Vector3.zero, foeType, spawnCount, alliedToPlayer: alliedToPlayer)
                .ToList()
                .ForEach(m =>
                {
                    PositionMinion(m);
                    ScaleMinion(m);
                    FinalizeMinion(m);
                });

            Destroy(this);
        }

        protected virtual void PositionMinion(GameObject minion)
        {
            if (Camera.main == null)
            {
                ChebsNecromancy.ChebError("MinionSpawner.PositionMinion: Camera.main is null.");
                return;
            }

            var cameraTransform = Camera.main.transform;
            var center = cameraTransform.position + cameraTransform.forward * 2;
            var randomPos = Random.insideUnitSphere.normalized * maxDistance + center;
            randomPos.y = center.y;
            minion.transform.position = randomPos;
        }

        protected virtual void ScaleMinion(GameObject minion)
        {
        }

        protected virtual void FinalizeMinion(GameObject minion)
        {
            var mobileUnit = minion.GetComponentInChildren<MobileUnit>();
            if (mobileUnit)
            {
                if (mobileUnit.Enemy.Behaviour != MobileBehaviour.Flying)
                    GameObjectHelper.AlignControllerToGround(minion.GetComponent<CharacterController>());
                else
                    minion.transform.localPosition += Vector3.up * 1.5f;
            }
            else
            {
                GameObjectHelper.AlignControllerToGround(minion.GetComponent<CharacterController>());
            }

            var undeadMinion = minion.AddComponent<UndeadMinion>();
            undeadMinion.createdWithMagnitude = magnitude;
            minion.SetActive(true);

            ChebsNecromancy.ChebLog(
                "Finalized minion: " +
                JsonConvert.SerializeObject(
                    mobileUnit.Enemy,
                    new JsonSerializerSettings
                    {
                        ReferenceLoopHandling = ReferenceLoopHandling.Ignore,
                        Error = (sender, args) => { }
                    }
                )
            );
        }
    }
}