using System.Collections.Generic;
using DaggerfallWorkshop;
using DaggerfallWorkshop.Game;
using DaggerfallWorkshop.Game.Entity;
using UnityEngine;

namespace ChebsNecromancyMod
{
    public class UndeadMinion : MonoBehaviour
    {
        [Tooltip("The magnitude that was used to create this minion.")]
        public int createdWithMagnitude = 1;

        [SerializeField] private float stopDistance = 5f;
        [SerializeField] private float doorCrouchingHeight = 5f;

        private EnemyMotor enemyMotor;
        private EnemySenses enemySenses;
        private CharacterController controller;
        private MobileUnit mobile;

        private int ignoreMaskForObstacles;

        private Vector3 destination;
        private float originalHeight;
        private bool obstacleDetected;
        private bool fallDetected;
        private bool foundUpwardSlope;
        private bool foundDoor;

        private const float TURN_SPEED = 20f;
        private const float YAW_ANGLE = 22.5f;
        private const float FALL_RAYCAST_DISTANCE = 1.5f;

        public static List<DaggerfallEnemy> GetActiveMinions()
        {
            var result = new List<DaggerfallEnemy>();
            var daggerfallEnemies = FindObjectsOfType<DaggerfallEnemy>();
            foreach (var daggerfallEnemy in daggerfallEnemies)
            {
                UndeadMinion undeadMinion;
                if (daggerfallEnemy.MobileUnit.Enemy.Team == MobileTeams.PlayerAlly
                    && daggerfallEnemy.TryGetComponent(out undeadMinion))
                {
                    result.Add(daggerfallEnemy);
                }
            }
            return result;
        }

        private void Awake()
        {
            enemyMotor = GetComponent<EnemyMotor>();
            enemySenses = enemyMotor.GetComponent<EnemySenses>();
            controller = enemyMotor.GetComponent<CharacterController>();
            mobile = enemyMotor.transform.GetComponentInChildren<MobileUnit>();

            ignoreMaskForObstacles = ~(1 << LayerMask.NameToLayer("SpellMissiles") | 1 << LayerMask.NameToLayer("Ignore Raycast"));

            enemyMotor.IsHostile = false;

            EnemySounds enemySounds;
            if (TryGetComponent(out enemySounds))
            {
                // mute that infernal roaring
                enemySounds.BarkSound = SoundClips.None;
            }
        }

        private void FixedUpdate()
        {
            if (enemyMotor != null && enemySenses != null && !enemySenses.TargetInSight)
            {
                FollowPlayer();
            }
        }

        private void FollowPlayer()
        {
            var moveSpeed = (1 + PlayerSpeedChanger.dfWalkBase) * MeshReader.GlobalScale * 1.5f;

            destination = Camera.main.transform.position;

            var direction = (destination - enemyMotor.transform.position).normalized;
            var distance = (destination - enemyMotor.transform.position).magnitude;

            if (distance >= stopDistance)
            {
                AttemptMove(direction, moveSpeed, Camera.main.transform);
            }
            else if (!enemySenses.TargetIsWithinYawAngle(YAW_ANGLE, destination))
            {
                TurnToTarget(direction);
            }
        }

        private void AttemptMove(Vector3 direction, float moveSpeed, Transform targetTransform)
        {
            if (!enemySenses.TargetIsWithinYawAngle(YAW_ANGLE / 4, destination))
            {
                TurnToTarget(direction);
            }

            var motion = direction * moveSpeed;
            var direction2d = new Vector3(direction.x, 0, direction.z);

            ObstacleCheck(direction2d);
            FallCheck(direction2d);

            if (fallDetected || obstacleDetected)
            {
                var position = targetTransform.position;
                var newPos = new Vector3(position.x, enemyMotor.transform.position.y, position.z);
                enemyMotor.transform.position = newPos - targetTransform.forward;
            }
            else
            {
                controller.Move(motion * Time.deltaTime);
            }
        }

        private void TurnToTarget(Vector3 targetDirection)
        {
            enemyMotor.transform.forward = Vector3.RotateTowards(enemyMotor.transform.forward, targetDirection, TURN_SPEED * Mathf.Deg2Rad, 0.0f);
        }

        private void FallCheck(Vector3 direction)
        {
            if (CanFly() || enemyMotor.IsLevitating || obstacleDetected || foundUpwardSlope || foundDoor)
            {
                fallDetected = false;
                return;
            }

            var checkDistance = 1;
            var rayOrigin = enemyMotor.transform.position;

            direction *= checkDistance;
            var ray = new Ray(rayOrigin + direction, Vector3.down);
            RaycastHit hit;
            fallDetected = !Physics.Raycast(ray, out hit, (originalHeight * 0.5f) + FALL_RAYCAST_DISTANCE);
        }

        bool CanFly()
        {
            return mobile.Enemy.Behaviour == MobileBehaviour.Flying || mobile.Enemy.Behaviour == MobileBehaviour.Spectral;
        }

        void ObstacleCheck(Vector3 direction)
        {
            obstacleDetected = false;
            var checkDistance = controller.radius / Mathf.Sqrt(2f);
            foundUpwardSlope = false;
            foundDoor = false;

            // Climbable/not climbable step for the player seems to be at around a height of 0.65f. The player is 1.8f tall.
            // Using the same ratio to height as these values, set the capsule for the enemy.
            Vector3 p1 = enemyMotor.transform.position + (Vector3.up * -originalHeight * 0.1388F);
            Vector3 p2 = p1 + (Vector3.up * Mathf.Min(originalHeight, doorCrouchingHeight) / 2);

            RaycastHit hit;
            if (Physics.CapsuleCast(p1, p2, controller.radius / 2, direction, out hit, checkDistance, ignoreMaskForObstacles))
            {
                obstacleDetected = true;
                var entityBehaviour2 = hit.transform.GetComponent<DaggerfallEntityBehaviour>();
                var door = hit.transform.GetComponent<DaggerfallActionDoor>();
                var loot = hit.transform.GetComponent<DaggerfallLoot>();

                if (entityBehaviour2)
                {
                    if (entityBehaviour2 == enemySenses.Target)
                        obstacleDetected = false;
                }
                else if (door)
                {
                    obstacleDetected = false;
                    foundDoor = true;
                    if (enemySenses.TargetIsWithinYawAngle(22.5f, door.transform.position))
                    {
                        enemySenses.LastKnownDoor = door;
                        enemySenses.DistanceToDoor = Vector3.Distance(enemyMotor.transform.position, door.transform.position);
                    }
                }
                else if (loot)
                {
                    obstacleDetected = false;
                }
                else if (!CanFly() && !enemyMotor.IsLevitating)
                {
                    // If an obstacle was hit, check for a climbable upward slope
                    var checkUp = enemyMotor.transform.position + direction;
                    checkUp.y++;

                    direction = (checkUp - enemyMotor.transform.position).normalized;
                    p1 = enemyMotor.transform.position + (Vector3.up * -originalHeight * 0.25f);
                    p2 = p1 + (Vector3.up * originalHeight * 0.75f);

                    if (!Physics.CapsuleCast(p1, p2, controller.radius / 2, direction, checkDistance))
                    {
                        obstacleDetected = false;
                        foundUpwardSlope = true;
                    }
                }
            }
        }
    }
}